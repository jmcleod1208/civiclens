import { PrismaClient } from '@civiclens/db'
import { Queue, Worker } from 'bullmq'
import { getRedisConnection, summarizeQueue } from '../queues/index.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.congress.gov/v3'
const PAGE_SIZE = 250
const RATE_LIMIT_MS = 200

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawBill {
  congress: number
  type: string
  number: string
  title: string
  introducedDate: string
  latestAction: { actionDate: string; text: string }
  url: string
}

interface BillListResponse {
  bills: RawBill[]
  pagination: { count: number; next?: string }
}

interface BillDetail {
  congress: number
  number: string
  type: string
  title: string
  introducedDate: string
  latestAction: { actionDate: string; text: string }
  policyArea?: { name: string }
  textVersions?: { url: string; count: number }
  constitutionalAuthorityStatementText?: string
  sponsors?: Array<{ bioguideId?: string; fullName: string }>
}

interface BillDetailResponse {
  bill: BillDetail
}

interface TextVersionsResponse {
  textVersions: Array<{
    date: string
    type: string
    formats: Array<{ type: string; url: string }>
  }>
}

export interface ParsedBill {
  raw: RawBill
  detail: BillDetail
  fullText: string
}

export interface NormalizedDocument {
  sourceUrl: string
  type: string
  level: 'federal'
  jurisdiction: string
  jurisdictionFips: string
  title: string
  fullText: string
  summary: null
  status: string
  topics: string[]
  introducedDate: Date
  lastActionDate: Date
}

export interface ScrapeResult {
  created: number
  updated: number
  errors: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildUrl(path: string, apiKey: string, extra: Record<string, string | number> = {}): string {
  const params = new URLSearchParams({
    format: 'json',
    api_key: apiKey,
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
  })
  return `${BASE_URL}${path}?${params}`
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`)
  return res.json() as Promise<T>
}

function mapStatus(actionText: string): string {
  const t = actionText.toLowerCase()
  if (t.includes('signed by the president') || t.includes('became public law')) return 'signed'
  if (t.includes('vetoed')) return 'vetoed'
  if (
    t.includes('passed senate') ||
    t.includes('passed house') ||
    t.includes('agreed to in senate') ||
    t.includes('agreed to in house')
  ) return 'passed'
  if (t.includes('failed') || t.includes('defeated') || t.includes('rejected')) return 'failed'
  if (t.includes('committee') || t.includes('referred') || t.includes('subcommittee')) return 'in_committee'
  return 'introduced'
}

function mapDocumentType(billType: string): string {
  switch (billType.toUpperCase()) {
    case 'HAMDT':
    case 'SAMDT':
      return 'amendment'
    case 'HRES':
    case 'SRES':
    case 'HCONRES':
    case 'SCONRES':
      return 'resolution'
    default:
      return 'bill'
  }
}

function canonicalSourceUrl(apiUrl: string): string {
  return apiUrl.split('?')[0] ?? apiUrl
}

async function fetchBillText(textVersionsUrl: string, apiKey: string): Promise<string> {
  try {
    const url = `${textVersionsUrl}?format=json&api_key=${apiKey}`
    const data = await fetchJson<TextVersionsResponse>(url)
    await delay(RATE_LIMIT_MS)

    const versions = data.textVersions ?? []
    if (!versions.length) return ''

    const latest = versions[versions.length - 1]!
    const textFormat = latest.formats.find(f => f.type === 'Formatted Text')
    if (!textFormat) return ''

    const textRes = await fetch(textFormat.url)
    if (!textRes.ok) return ''
    await delay(RATE_LIMIT_MS)

    const html = await textRes.text()
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  } catch (err) {
    console.warn('[congress] Failed to fetch bill text:', err)
    return ''
  }
}

function requireApiKey(): string {
  const key = process.env.CONGRESS_API_KEY
  if (!key) throw new Error('CONGRESS_API_KEY env var is not set')
  return key
}

// ─── Structured scraper object ────────────────────────────────────────────────

export const congressScraper = {
  /**
   * Fetches one page of raw bill summaries from Congress.gov.
   * Defaults to the first page (offset 0) — useful for smoke-testing.
   */
  async fetch(offset = 0, limit = PAGE_SIZE): Promise<RawBill[]> {
    const apiKey = requireApiKey()
    const url = buildUrl('/bill', apiKey, { limit, offset })
    console.log(`[congress] Fetching bills offset=${offset} limit=${limit}`)
    const data = await fetchJson<BillListResponse>(url)
    await delay(RATE_LIMIT_MS)
    return data.bills ?? []
  },

  /**
   * Enriches a list of raw bill summaries by fetching the detail endpoint
   * and full text for each one. Errors per bill are logged and skipped.
   */
  async parse(raw: RawBill[]): Promise<ParsedBill[]> {
    const apiKey = requireApiKey()
    const results: ParsedBill[] = []

    for (const bill of raw) {
      try {
        const detailUrl = buildUrl(
          `/bill/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}`,
          apiKey,
        )
        const { bill: detail } = await fetchJson<BillDetailResponse>(detailUrl)
        await delay(RATE_LIMIT_MS)

        let fullText = ''
        if (detail.textVersions?.url) {
          fullText = await fetchBillText(detail.textVersions.url, apiKey)
        }
        if (!fullText && detail.constitutionalAuthorityStatementText) {
          fullText = detail.constitutionalAuthorityStatementText
        }

        results.push({ raw: bill, detail, fullText })
      } catch (err) {
        console.error(
          `[congress] parse: skipping ${bill.congress}/${bill.type}/${bill.number}:`,
          err,
        )
      }
    }

    return results
  },

  /**
   * Maps parsed bills to the NormalizedDocument shape ready for DB upsert.
   */
  normalize(parsed: ParsedBill[]): NormalizedDocument[] {
    return parsed.map(({ raw, detail, fullText }) => ({
      sourceUrl: canonicalSourceUrl(raw.url),
      type: mapDocumentType(raw.type),
      level: 'federal' as const,
      jurisdiction: 'United States',
      jurisdictionFips: 'US',
      title: detail.title,
      fullText,
      summary: null,
      status: mapStatus(detail.latestAction.text),
      topics: detail.policyArea ? [detail.policyArea.name] : [],
      introducedDate: new Date(detail.introducedDate),
      lastActionDate: new Date(detail.latestAction.actionDate),
    }))
  },

  /**
   * Upserts all normalized documents into the database.
   * New documents are enqueued for summarization.
   */
  async upsertAll(docs: NormalizedDocument[]): Promise<ScrapeResult> {
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
            try {
              await summarizeQueue.add('summarize', { documentId: newDoc.id })
            } catch {
              // Redis may not be running in test environments — non-fatal
            }
          }
        } catch (err) {
          errors++
          console.error(`[congress] upsertAll: error on ${doc.sourceUrl}:`, err)
        }
      }
    } finally {
      await db.$disconnect()
    }

    console.log(`[congress] upsertAll complete — created=${created} updated=${updated} errors=${errors}`)
    return { created, updated, errors }
  },
}

// ─── Full paginated scrape (used by the cron worker) ─────────────────────────

export async function scrapeCongressBills(): Promise<ScrapeResult> {
  const apiKey = requireApiKey()

  let totalCreated = 0
  let totalUpdated = 0
  let totalErrors = 0
  let offset = 0
  let totalCount: number | null = null

  console.log('[congress] Full paginated scrape started')

  while (true) {
    const url = buildUrl('/bill', apiKey, { limit: PAGE_SIZE, offset })
    console.log(`[congress] Fetching page offset=${offset} / ${totalCount ?? '?'}`)

    const listData = await fetchJson<BillListResponse>(url)
    await delay(RATE_LIMIT_MS)

    if (totalCount === null) {
      totalCount = listData.pagination.count
      console.log(`[congress] Total bills: ${totalCount}`)
    }

    const raw = listData.bills ?? []
    if (!raw.length) break

    const parsed = await congressScraper.parse(raw)
    const normalized = congressScraper.normalize(parsed)
    const { created, updated, errors } = await congressScraper.upsertAll(normalized)

    totalCreated += created
    totalUpdated += updated
    totalErrors += errors

    offset += PAGE_SIZE
    if (offset >= totalCount) break
  }

  console.log(
    `[congress] Full scrape complete — created=${totalCreated} updated=${totalUpdated} errors=${totalErrors}`,
  )
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors }
}

// ─── BullMQ cron job ──────────────────────────────────────────────────────────

export async function registerCongressCronJob(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    'congress-scraper-cron',
    { pattern: '0 */6 * * *' },
    { name: 'run', data: {} },
  )
  console.log('[congress] Cron job registered: 0 */6 * * *')
}

export function createCongressScraperWorker(): Worker {
  return new Worker(
    'congress-scraper',
    async job => {
      console.log(`[congress] Worker received job id=${job.id}`)
      return scrapeCongressBills()
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  )
}
