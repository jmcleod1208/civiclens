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

export interface DistrictConfig {
  state: string
  districtSlug: string
  jurisdictionName: string
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
  items: RawAgendaItem[]
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
  private readonly appPath: string

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
    // Node's fetch consolidates Set-Cookie headers into `set-cookie`.
    const raw = (res.headers as any).getSetCookie?.() ?? [res.headers.get('set-cookie')]
    this.cookies = (raw as string[])
      .filter(Boolean)
      .map(c => c!.split(';')[0])
      .join('; ')
  }

  /**
   * POST to a BoardDocs AJAX endpoint with the session cookies and the
   * `?open&{random}` cache-buster. `formBody` is form-urlencoded data.
   * Returns the parsed body (JSON, XML, or raw HTML based on contentTypeHint).
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

    // HTML responses are returned as-is; JSON/XML go through parseDualFormat.
    const looksHtml =
      contentType.includes('text/html') ||
      (raw.trimStart().startsWith('<') && !raw.trimStart().startsWith('<?xml'))
    if (!looksHtml) {
      try {
        parsed = parseDualFormat(raw, contentType)
      } catch (err) {
        // Re-throw with the user-friendly hint
        throw new Error(
          `${(err as Error).message}. Hint: This BoardDocs instance returns ` +
            `XML — update the parser to handle both JSON and XML responses.`,
        )
      }
    }

    return { parsed, raw, contentType }
  }
}

// ─── HTML parsing for agenda items ────────────────────────────────────────────

/**
 * Pulls agenda-item rows out of a BD-GetMeeting HTML response.
 * BoardDocs marks items with `<a class="agenda-item ..." unique="{id}">…</a>`
 * inside a `<li>` whose data attributes carry the category.
 */
function parseAgendaItemsFromHtml(html: string): RawAgendaItem[] {
  const items: RawAgendaItem[] = []
  // Capture <li ... data-category="..."> ... <a ... unique="{id}" ...>{name}</a> ... </li>
  const itemRegex =
    /<li[^>]*\sdata-category="([^"]*)"[^>]*>([\s\S]*?)<\/li>/gi
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

  // Fallback: any `<a unique="..." class="...agenda-item...">` outside the
  // structured list — newer BoardDocs themes sometimes flatten the markup.
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

function isMinutesMeeting(name: string): boolean {
  return /minutes?\b/i.test(name)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Meeting list normalization ───────────────────────────────────────────────

/**
 * BD-GetMeetingsList returns an array of meeting objects with snake_case
 * keys: { unique, name, numberdate, start, ... }. Wrap them in a shape the
 * normalize step expects.
 */
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

/**
 * Parses BoardDocs `numberdate` (YYYYMMDD or similar) into a Date.
 */
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

// ─── Structured scraper object ────────────────────────────────────────────────

export const boarddocsScraper = {
  /**
   * Fetches the list of recent meetings for a district.
   * Performs a session warmup so subsequent AJAX calls aren't blocked.
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
   * For each meeting, fetches the meeting HTML and parses out agenda items.
   * Reuses the session from fetchMeetings so cookies stay valid.
   */
  async parse(
    district: DistrictConfig,
    session: BoardDocsSession,
    meetings: RawMeeting[],
  ): Promise<ParsedMeeting[]> {
    const results: ParsedMeeting[] = []
    for (const meeting of meetings) {
      try {
        const { raw } = await session.post('BD-GetMeeting', { id: meeting.uniqueId })
        await delay(RATE_LIMIT_MS)
        const items = typeof raw === 'string' ? parseAgendaItemsFromHtml(raw) : []
        results.push({ district, meeting, items })
      } catch (err) {
        console.warn(
          `[boarddocs:${district.state}/${district.districtSlug}] ` +
            `Meeting ${meeting.uniqueId} fetch failed: ${(err as Error).message}`,
        )
        results.push({ district, meeting, items: [] })
      }
    }
    return results
  },

  /**
   * One CivicDocument per meeting (type=agenda or minutes) plus one
   * CivicDocument per agenda item (type from item.category).
   */
  normalize(parsed: ParsedMeeting[]): NormalizedDocument[] {
    const docs: NormalizedDocument[] = []
    for (const { district, meeting, items } of parsed) {
      const { state, districtSlug, jurisdictionName } = district
      const meetingDate = parseMeetingDate(meeting.start || meeting.numberdate || '')
      const meetingUrl = `${BASE_URL}/${state}/${districtSlug}/Board.nsf/goto?open&id=${meeting.uniqueId}`

      docs.push({
        sourceUrl: meetingUrl,
        type: isMinutesMeeting(meeting.name) ? 'minutes' : 'agenda',
        level: 'school_board' as const,
        jurisdiction: jurisdictionName,
        jurisdictionFips: null,
        title: meeting.name,
        fullText: items.map(i => i.name).join('\n'),
        summary: null,
        status: 'introduced',
        topics: [],
        introducedDate: meetingDate,
        lastActionDate: meetingDate,
      })

      for (const item of items) {
        const itemUrl = `${BASE_URL}/${state}/${districtSlug}/Board.nsf/goto?open&id=${item.uniqueId}`
        docs.push({
          sourceUrl: itemUrl,
          type: mapItemType(item.category),
          level: 'school_board' as const,
          jurisdiction: jurisdictionName,
          jurisdictionFips: null,
          title: item.name,
          fullText: item.description ?? '',
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

  async upsertAll(docs: NormalizedDocument[]): Promise<{
    created: number
    updated: number
    errors: number
  }> {
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
            await db.civicDocument.update({ where: { id: existing.id }, data: doc as any })
            updated++
          } else {
            const newDoc = await db.civicDocument.create({
              data: doc as any,
              select: { id: true },
            })
            created++
            try { await getSummarizeQueue().add('summarize', { documentId: newDoc.id }) }
            catch { /* Redis may not be running */ }
          }
        } catch (err) {
          errors++
          console.error(`[boarddocs] upsertAll: error on ${doc.sourceUrl}:`, err)
        }
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

// ─── Full scrape for one district (used by the cron worker) ──────────────────

export async function scrapeDistrict(district: DistrictConfig): Promise<ScrapeResult> {
  const key = `${district.state}/${district.districtSlug}`
  console.log(`[boarddocs:${key}] Scrape started`)

  const { session, meetings } = await boarddocsScraper.fetchMeetings(district)
  const parsed = await boarddocsScraper.parse(district, session, meetings)
  const normalized = boarddocsScraper.normalize(parsed)
  const result = await boarddocsScraper.upsertAll(normalized)

  console.log(
    `[boarddocs:${key}] Scrape complete — created=${result.created} updated=${result.updated} errors=${result.errors}`,
  )
  return { district: key, ...result }
}

// ─── BullMQ cron job ──────────────────────────────────────────────────────────

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

export function createBoardDocsScraperWorker(): Worker {
  return new Worker(
    'boarddocs-scraper',
    async job => {
      const district = job.data as DistrictConfig
      console.log(`[boarddocs] Worker received job ${district.state}/${district.districtSlug} id=${job.id}`)
      return scrapeDistrict(district)
    },
    { connection: getRedisConnection(), concurrency: 1 },
  )
}
