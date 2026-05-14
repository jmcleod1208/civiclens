import { PrismaClient } from '@civiclens/db'
import { Queue, Worker } from 'bullmq'
import { XMLParser } from 'fast-xml-parser'
import { getRedisConnection, getSummarizeQueue } from '../queues/index.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://go.boarddocs.com'
const RATE_LIMIT_MS = 500
const RECENT_MEETING_LIMIT = 20

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration for a single BoardDocs district. Maps directly to the
 * SchoolDistrict DB model; use `registerDistrict()` to persist one.
 */
export interface DistrictConfig {
  state: string
  districtSlug: string
  jurisdictionName: string
  jurisdictionFips?: string
}

/** Meeting summary from BD-GetMeetingsList JSON response. */
export interface RawMeeting {
  uniqueId: string
  name: string
  start: string
  numberdate?: string
}

/** Agenda item parsed from BD-GetMeeting HTML response. */
export interface RawAgendaItem {
  uniqueId: string
  name: string
  category?: string
  description?: string
}

export interface ParsedMeeting {
  district: DistrictConfig
  meeting: RawMeeting
  /** Agenda items extracted from the meeting HTML. */
  items: RawAgendaItem[]
  /**
   * Raw HTML of the approved minutes document if BoardDocs exposes one for
   * this meeting (via BD-GetMinutes). Null when the endpoint returns nothing
   * useful or errors.
   */
  minutesHtml: string | null
}

export interface NormalizedDocument {
  sourceUrl: string
  type: string
  level: 'school_board'
  jurisdiction: string
  jurisdictionFips: null
  title: string
  fullText: string
  summary: null
  status: string
  topics: string[]
  introducedDate: Date
  lastActionDate: Date
}

export interface ScrapeResult {
  district: string
  created: number
  updated: number
  errors: number
}

// ─── Dual-format response parser ──────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
})

/**
 * Detects whether a response body is JSON or XML and parses accordingly.
 * Older BoardDocs districts can return XML from endpoints that newer ones
 * serve as JSON; this handles both transparently.
 */
export function parseDualFormat(body: string, contentType?: string): unknown {
  const ct = (contentType ?? '').toLowerCase()
  const trimmed = body.trim()

  if (ct.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) } catch { /* fall through */ }
  }
  if (ct.includes('xml') || trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
    try { return xmlParser.parse(trimmed) } catch (err) {
      throw new Error(`Failed to parse response as XML: ${(err as Error).message}`)
    }
  }
  try { return JSON.parse(trimmed) } catch {
    throw new Error('Response is neither valid JSON nor XML')
  }
}

// ─── Session-managed HTTP client ──────────────────────────────────────────────

/**
 * BoardDocs aggressively blocks bare HTTP requests. Each district scrape needs:
 *   1. A session warmup GET to the Public page (sets cookies)
 *   2. Realistic browser headers (UA + Accept)
 *   3. A Referer header on every subsequent request
 *   4. Cache-busting `?open&{random}` on AJAX endpoints
 */
class BoardDocsSession {
  private cookies = ''
  private readonly referer: string
  readonly appPath: string

  constructor(private readonly district: DistrictConfig) {
    this.appPath = `${district.state}/${district.districtSlug}/Board.nsf`
    this.referer = `${BASE_URL}/${this.appPath}/Public`
  }

  async warmup(): Promise<void> {
    const res = await fetch(this.referer, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) {
      throw new Error(`Session warmup failed for ${this.appPath}: HTTP ${res.status}`)
    }
    const raw = (res.headers as any).getSetCookie?.() ?? [res.headers.get('set-cookie')]
    this.cookies = (raw as string[])
      .filter(Boolean)
      .map(c => c!.split(';')[0])
      .join('; ')
  }

  /**
   * POST to a BoardDocs AJAX endpoint. Returns the raw body string plus a
   * parsed form (JSON/XML) for structured endpoints, or the raw string for
   * HTML responses.
   */
  async post(
    endpoint: string,
    formBody: Record<string, string> = {},
  ): Promise<{ parsed: unknown; raw: string; contentType: string }> {
    const url = `${BASE_URL}/${this.appPath}/${endpoint}?open&${Math.random()}`
    const body = new URLSearchParams(formBody).toString()

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/html, application/xml;q=0.9, */*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: this.referer,
        Cookie: this.cookies,
      },
      body,
    })

    if (!res.ok) {
      throw new Error(`POST ${endpoint} failed: HTTP ${res.status} ${res.statusText}`)
    }

    const raw = await res.text()
    const contentType = res.headers.get('content-type') ?? ''
    let parsed: unknown = raw

    const looksHtml =
      contentType.includes('text/html') ||
      (raw.trimStart().startsWith('<') && !raw.trimStart().startsWith('<?xml'))
    if (!looksHtml) {
      try {
        parsed = parseDualFormat(raw, contentType)
      } catch (err) {
        throw new Error(`${(err as Error).message}`)
      }
    }

    return { parsed, raw, contentType }
  }
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

/**
 * Pulls agenda-item rows out of a BD-GetMeeting HTML response.
 * BoardDocs marks items with `<a class="agenda-item ..." unique="{id}">…</a>`
 * inside a `<li>` whose data attributes carry the category.
 */
function parseAgendaItemsFromHtml(html: string): RawAgendaItem[] {
  const items: RawAgendaItem[] = []

  const itemRegex = /<li[^>]*\sdata-category="([^"]*)"[^>]*>([\s\S]*?)<\/li>/gi
  for (const liMatch of html.matchAll(itemRegex)) {
    const category = liMatch[1]
    const body = liMatch[2] ?? ''
    const aMatch = body.match(/<a[^>]*\sunique="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!aMatch) continue
    const uniqueId = aMatch[1]!
    const name = htmlToText(aMatch[2] ?? '')
    if (!uniqueId || !name) continue
    items.push({ uniqueId, name, category: category || undefined })
  }

  // Fallback for newer BoardDocs themes that flatten the markup
  if (!items.length) {
    const flatRegex =
      /<a[^>]*\sunique="([^"]+)"[^>]*\sclass="[^"]*agenda-item[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
    for (const m of html.matchAll(flatRegex)) {
      items.push({ uniqueId: m[1]!, name: htmlToText(m[2] ?? '') })
    }
  }

  return items
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function mapItemType(category: string | undefined): string {
  const c = (category ?? '').toLowerCase()
  if (c.includes('motion')) return 'motion'
  if (c.includes('resolution')) return 'resolution'
  if (c.includes('ordinance')) return 'ordinance'
  if (c.includes('amendment')) return 'amendment'
  return 'motion'
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Meeting list normalization ────────────────────────────────────────────────

function normalizeMeetingsList(parsed: unknown): RawMeeting[] {
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.meetings)
    ? (parsed as any).meetings
    : []

  const meetings: RawMeeting[] = []
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue
    const obj = m as Record<string, any>
    const uniqueId = obj.unique ?? obj.uniqueId ?? obj.id ?? obj['@_unique']
    const name = obj.name ?? obj.title
    const numberdate = obj.numberdate ?? obj.start
    if (!uniqueId || !name) continue
    meetings.push({
      uniqueId: String(uniqueId),
      name: String(name),
      start: String(numberdate ?? ''),
      numberdate: numberdate ? String(numberdate) : undefined,
    })
  }
  return meetings
}

function parseMeetingDate(s: string): Date {
  const trimmed = s.trim()
  if (/^\d{8}$/.test(trimmed)) {
    return new Date(
      `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}T00:00:00Z`,
    )
  }
  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? new Date() : d
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Registers a district in the SchoolDistrict table (upsert).
 * Call this once per district to make it eligible for cron scraping.
 *
 * @example
 * await registerDistrict({
 *   state: 'oh',
 *   districtSlug: 'Dublin',
 *   jurisdictionName: 'Dublin City School District, OH',
 * })
 */
export async function registerDistrict(config: DistrictConfig): Promise<void> {
  const db = new PrismaClient()
  try {
    await db.schoolDistrict.upsert({
      where: { state_boardDocsSlug: { state: config.state, boardDocsSlug: config.districtSlug } },
      update: { name: config.jurisdictionName, jurisdictionFips: config.jurisdictionFips ?? null },
      create: {
        name: config.jurisdictionName,
        state: config.state,
        boardDocsSlug: config.districtSlug,
        jurisdictionFips: config.jurisdictionFips ?? null,
      },
    })
    console.log(`[boarddocs] Registered district ${config.state}/${config.districtSlug}`)
  } finally {
    await db.$disconnect()
  }
}

/**
 * Loads all registered districts from the SchoolDistrict table and maps them
 * to DistrictConfig objects ready for scraping.
 */
export async function loadDistricts(): Promise<DistrictConfig[]> {
  const db = new PrismaClient()
  try {
    const rows = await db.schoolDistrict.findMany({ orderBy: { state: 'asc' } })
    return rows.map(r => ({
      state: r.state,
      districtSlug: r.boardDocsSlug,
      jurisdictionName: r.name,
      jurisdictionFips: r.jurisdictionFips ?? undefined,
    }))
  } finally {
    await db.$disconnect()
  }
}

/** Marks a district's lastScrapedAt timestamp after a successful scrape. */
async function touchLastScrapedAt(db: PrismaClient, config: DistrictConfig): Promise<void> {
  try {
    await db.schoolDistrict.update({
      where: { state_boardDocsSlug: { state: config.state, boardDocsSlug: config.districtSlug } },
      data: { lastScrapedAt: new Date() },
    })
  } catch {
    // District may not be registered in DB (e.g. local dev with ad-hoc configs)
  }
}

// ─── Structured scraper object ────────────────────────────────────────────────

export const boarddocsScraper = {
  /**
   * Fetches the list of recent meetings for a district.
   * Performs a session warmup so subsequent AJAX calls are not blocked.
   */
  async fetchMeetings(district: DistrictConfig): Promise<{
    session: BoardDocsSession
    meetings: RawMeeting[]
  }> {
    const session = new BoardDocsSession(district)
    await session.warmup()
    await delay(RATE_LIMIT_MS)

    const { parsed } = await session.post('BD-GetMeetingsList')
    const meetings = normalizeMeetingsList(parsed)
    console.log(
      `[boarddocs:${district.state}/${district.districtSlug}] Found ${meetings.length} meetings`,
    )
    return { session, meetings: meetings.slice(0, RECENT_MEETING_LIMIT) }
  },

  /**
   * For each meeting:
   *   1. Fetches the agenda HTML and parses out agenda items.
   *   2. Attempts to fetch a separate approved-minutes document (BD-GetMinutes).
   *      If that endpoint does not exist or returns nothing useful the field
   *      is set to null and a minutes CivicDocument is not created.
   *
   * Reuses the session from fetchMeetings so cookies stay valid.
   */
  async parse(
    district: DistrictConfig,
    session: BoardDocsSession,
    meetings: RawMeeting[],
  ): Promise<ParsedMeeting[]> {
    const results: ParsedMeeting[] = []

    for (const meeting of meetings) {
      // ── 1. Agenda ────────────────────────────────────────────────────────
      let agendaHtml = ''
      let items: RawAgendaItem[] = []
      try {
        const { raw } = await session.post('BD-GetMeeting', { id: meeting.uniqueId })
        agendaHtml = raw
        items = parseAgendaItemsFromHtml(agendaHtml)
        await delay(RATE_LIMIT_MS)
      } catch (err) {
        console.warn(
          `[boarddocs:${district.state}/${district.districtSlug}] ` +
            `Agenda fetch for ${meeting.uniqueId} failed: ${(err as Error).message}`,
        )
      }

      // ── 2. Minutes (best-effort) ──────────────────────────────────────────
      let minutesHtml: string | null = null
      try {
        const { raw } = await session.post('BD-GetMinutes', { id: meeting.uniqueId })
        await delay(RATE_LIMIT_MS)
        // Accept the minutes response only when it is substantive and differs
        // from the agenda (some instances echo the same page for unknown IDs).
        const trimmed = raw.trim()
        if (trimmed.length > 200 && trimmed !== agendaHtml.trim()) {
          minutesHtml = raw
        }
      } catch {
        // Endpoint does not exist for this district — silently skip.
      }

      results.push({ district, meeting, items, minutesHtml })
    }

    return results
  },

  /**
   * Produces CivicDocument records from parsed meetings:
   *   • One "agenda" document per meeting (fullText = joined item titles).
   *   • One "minutes" document per meeting when minutes HTML was fetched.
   *   • One document per individual agenda item.
   */
  normalize(parsed: ParsedMeeting[]): NormalizedDocument[] {
    const docs: NormalizedDocument[] = []

    for (const { district, meeting, items, minutesHtml } of parsed) {
      const { state, districtSlug, jurisdictionName, jurisdictionFips } = district
      const meetingDate = parseMeetingDate(meeting.start || meeting.numberdate || '')
      const meetingUrl = `${BASE_URL}/${state}/${districtSlug}/Board.nsf/goto?open&id=${meeting.uniqueId}`

      // ── Meeting-level agenda document ────────────────────────────────────
      docs.push({
        sourceUrl: `${meetingUrl}&doc=agenda`,
        type: 'agenda',
        level: 'school_board',
        jurisdiction: jurisdictionName,
        jurisdictionFips: jurisdictionFips ?? null,
        title: meeting.name,
        fullText: items.length
          ? items.map(i => [i.category, i.name].filter(Boolean).join(' — ')).join('\n')
          : meeting.name,
        summary: null,
        status: 'introduced',
        topics: [...new Set(items.map(i => i.category).filter((c): c is string => Boolean(c)))],
        introducedDate: meetingDate,
        lastActionDate: meetingDate,
      })

      // ── Meeting-level minutes document (when available) ──────────────────
      if (minutesHtml) {
        docs.push({
          sourceUrl: `${meetingUrl}&doc=minutes`,
          type: 'minutes',
          level: 'school_board',
          jurisdiction: jurisdictionName,
          jurisdictionFips: jurisdictionFips ?? null,
          title: `Minutes: ${meeting.name}`,
          fullText: htmlToText(minutesHtml),
          summary: null,
          status: 'passed',
          topics: [],
          introducedDate: meetingDate,
          lastActionDate: meetingDate,
        })
      }

      // ── Individual agenda item documents ─────────────────────────────────
      for (const item of items) {
        const itemUrl = `${BASE_URL}/${state}/${districtSlug}/Board.nsf/goto?open&id=${item.uniqueId}`
        docs.push({
          sourceUrl: itemUrl,
          type: mapItemType(item.category),
          level: 'school_board',
          jurisdiction: jurisdictionName,
          jurisdictionFips: jurisdictionFips ?? null,
          title: item.name,
          fullText: item.description ?? item.name,
          summary: null,
          status: 'introduced',
          topics: item.category ? [item.category] : [],
          introducedDate: meetingDate,
          lastActionDate: meetingDate,
        })
      }
    }

    return docs
  },

  async upsertAll(
    docs: NormalizedDocument[],
    districtConfig?: DistrictConfig,
  ): Promise<{ created: number; updated: number; errors: number }> {
    const db = new PrismaClient()
    let created = 0
    let updated = 0
    let errors = 0

    try {
      for (const doc of docs) {
        try {
          const existing = await db.civicDocument.findUnique({
            where: { sourceUrl: doc.sourceUrl },
            select: { id: true },
          })
          if (existing) {
            await db.civicDocument.update({
              where: { id: existing.id },
              data: doc as any,
            })
            updated++
          } else {
            const newDoc = await db.civicDocument.create({
              data: doc as any,
              select: { id: true },
            })
            created++
            try {
              await getSummarizeQueue().add('summarize', { documentId: newDoc.id })
            } catch {
              // Redis may not be running in dev
            }
          }
        } catch (err) {
          errors++
          console.error(`[boarddocs] upsertAll: error on ${doc.sourceUrl}:`, err)
        }
      }

      if (districtConfig) {
        await touchLastScrapedAt(db, districtConfig)
      }
    } finally {
      await db.$disconnect()
    }

    console.log(
      `[boarddocs] upsertAll complete — created=${created} updated=${updated} errors=${errors}`,
    )
    return { created, updated, errors }
  },
}

// ─── Full scrape for one district ─────────────────────────────────────────────

export async function scrapeDistrict(district: DistrictConfig): Promise<ScrapeResult> {
  const key = `${district.state}/${district.districtSlug}`
  console.log(`[boarddocs:${key}] Scrape started`)

  const { session, meetings } = await boarddocsScraper.fetchMeetings(district)
  const parsed = await boarddocsScraper.parse(district, session, meetings)
  const normalized = boarddocsScraper.normalize(parsed)
  const result = await boarddocsScraper.upsertAll(normalized, district)

  console.log(
    `[boarddocs:${key}] Scrape complete — ` +
      `created=${result.created} updated=${result.updated} errors=${result.errors}`,
  )
  return { district: key, ...result }
}

// ─── BullMQ cron & worker ─────────────────────────────────────────────────────

/**
 * Registers a daily cron job for each district in `districts`.
 * Normally you call `registerAllDistrictCronJobs` instead, which loads from DB.
 */
export async function registerBoardDocsCronJobs(
  queue: Queue,
  districts: DistrictConfig[],
): Promise<void> {
  for (const d of districts) {
    const id = `boarddocs-${d.state}-${d.districtSlug}-cron`
    await queue.upsertJobScheduler(
      id,
      { pattern: '0 6 * * *' }, // daily at 06:00 UTC
      { name: 'scrape-district', data: d },
    )
    console.log(`[boarddocs] Cron registered for ${d.state}/${d.districtSlug}`)
  }
}

/**
 * Loads all districts from the SchoolDistrict table and registers a daily
 * cron job for each one. Call this at server startup.
 */
export async function registerAllDistrictCronJobs(queue: Queue): Promise<void> {
  const districts = await loadDistricts()
  if (districts.length === 0) {
    console.warn('[boarddocs] No districts found in DB. Register districts with registerDistrict().')
    return
  }
  await registerBoardDocsCronJobs(queue, districts)
}

export function createBoardDocsScraperWorker(): Worker {
  return new Worker(
    'boarddocs-scraper',
    async job => {
      const district = job.data as DistrictConfig
      console.log(
        `[boarddocs] Worker received job ${district.state}/${district.districtSlug} id=${job.id}`,
      )
      return scrapeDistrict(district)
    },
    { connection: getRedisConnection(), concurrency: 1 },
  )
}
