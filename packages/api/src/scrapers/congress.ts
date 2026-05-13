import { PrismaClient } from '@civiclens/db'
import { Queue, Worker } from 'bullmq'
import { getRedisConnection, summarizeQueue } from '../queues/index.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.congress.gov/v3'
const PAGE_SIZE = 250
const RATE_LIMIT_MS = 200

// ─── Types ────────────────────────────────────────────────────────────────────

interface CongressBillSummary {
  congress: number
  type: string
  number: string
  title: string
  introducedDate: string
  latestAction: { actionDate: string; text: string }
  url: string
}

interface BillListResponse {
  bills: CongressBillSummary[]
  pagination: { count: number; next?: string }
}

interface CongressBillDetail {
  bill: {
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
}

interface TextVersionsResponse {
  textVersions: Array<{
    date: string
    type: string
    formats: Array<{ type: string; url: string }>
  }>
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
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`)
  }
  return res.json() as Promise<T>
}

/**
 * Maps a Congress.gov latest action string to our DocumentStatus enum value.
 */
function mapStatus(actionText: string): string {
  const t = actionText.toLowerCase()
  if (t.includes('signed by the president') || t.includes('became public law')) return 'signed'
  if (t.includes('vetoed')) return 'vetoed'
  if (
    t.includes('passed senate') ||
    t.includes('passed house') ||
    t.includes('agreed to in senate') ||
    t.includes('agreed to in house')
  )
    return 'passed'
  if (t.includes('failed') || t.includes('defeated') || t.includes('rejected')) return 'failed'
  if (t.includes('committee') || t.includes('referred') || t.includes('subcommittee'))
    return 'in_committee'
  return 'introduced'
}

/**
 * Maps a Congress.gov bill type code (HR, S, HJRES…) to our DocumentType enum.
 */
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

/**
 * Derives a stable, human-readable sourceUrl from the API URL.
 * Strips query parameters so the key is the same regardless of API version.
 * e.g. https://api.congress.gov/v3/bill/119/hr/100
 */
function canonicalSourceUrl(apiUrl: string): string {
  return apiUrl.split('?')[0] ?? apiUrl
}

/**
 * Fetches the plain-text content of the most recent bill text version.
 * Returns an empty string if no text is available or fetch fails.
 */
async function fetchBillText(textVersionsUrl: string, apiKey: string): Promise<string> {
  try {
    const url = `${textVersionsUrl}?format=json&api_key=${apiKey}`
    const data = await fetchJson<TextVersionsResponse>(url)
    await delay(RATE_LIMIT_MS)

    const versions = data.textVersions ?? []
    if (!versions.length) return ''

    // Congress.gov returns oldest-first; take the last (most recent)
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

// ─── Main scraper ─────────────────────────────────────────────────────────────

export interface ScrapeResult {
  created: number
  updated: number
  errors: number
}

export async function scrapeCongressBills(): Promise<ScrapeResult> {
  const apiKey = process.env.CONGRESS_API_KEY
  if (!apiKey) throw new Error('CONGRESS_API_KEY env var is not set')

  const db = new PrismaClient()
  let created = 0
  let updated = 0
  let errors = 0
  let offset = 0
  let totalCount: number | null = null

  console.log('[congress] Scrape started')

  try {
    while (true) {
      const listUrl = buildUrl('/bill', apiKey, { limit: PAGE_SIZE, offset })
      console.log(`[congress] Fetching page offset=${offset} / ${totalCount ?? '?'}`)

      const listData = await fetchJson<BillListResponse>(listUrl)
      await delay(RATE_LIMIT_MS)

      if (totalCount === null) {
        totalCount = listData.pagination.count
        console.log(`[congress] Total bills reported by API: ${totalCount}`)
      }

      const bills = listData.bills ?? []
      if (!bills.length) break

      for (const bill of bills) {
        try {
          // 1. Fetch bill detail
          const detailUrl = buildUrl(
            `/bill/${bill.congress}/${bill.type.toLowerCase()}/${bill.number}`,
            apiKey,
          )
          const { bill: detail } = await fetchJson<CongressBillDetail>(detailUrl)
          await delay(RATE_LIMIT_MS)

          // 2. Fetch full text (best-effort)
          let fullText = ''
          if (detail.textVersions?.url) {
            fullText = await fetchBillText(detail.textVersions.url, apiKey)
          }
          // Fallback: constitutional authority statement is often present when no text exists yet
          if (!fullText && detail.constitutionalAuthorityStatementText) {
            fullText = detail.constitutionalAuthorityStatementText
          }

          // 3. Normalize to CivicDocument shape
          const sourceUrl = canonicalSourceUrl(bill.url)
          const docData = {
            sourceUrl,
            type: mapDocumentType(bill.type) as any,
            level: 'federal' as any,
            jurisdiction: 'United States',
            jurisdictionFips: 'US',
            title: detail.title,
            fullText,
            summary: null,
            status: mapStatus(detail.latestAction.text) as any,
            topics: detail.policyArea ? [detail.policyArea.name] : [],
            introducedDate: new Date(detail.introducedDate),
            lastActionDate: new Date(detail.latestAction.actionDate),
          }

          // 4. Upsert using sourceUrl as the unique key
          const existing = await db.civicDocument.findUnique({
            where: { sourceUrl },
            select: { id: true },
          })

          if (existing) {
            await db.civicDocument.update({
              where: { id: existing.id },
              data: docData,
            })
            updated++
            console.log(`[congress] Updated  ${bill.congress}/${bill.type}/${bill.number}`)
          } else {
            const newDoc = await db.civicDocument.create({
              data: docData,
              select: { id: true },
            })
            created++
            console.log(`[congress] Created  ${bill.congress}/${bill.type}/${bill.number}`)

            // 5. Enqueue summarization job for new documents
            await summarizeQueue.add('summarize', { documentId: newDoc.id })
          }
        } catch (err) {
          errors++
          console.error(
            `[congress] Error processing ${bill.congress}/${bill.type}/${bill.number}:`,
            err,
          )
        }
      }

      offset += PAGE_SIZE
      if (offset >= totalCount) break
    }
  } finally {
    await db.$disconnect()
  }

  console.log(
    `[congress] Scrape complete — created=${created} updated=${updated} errors=${errors}`,
  )
  return { created, updated, errors }
}

// ─── BullMQ cron job ──────────────────────────────────────────────────────────

/**
 * Registers a repeating job scheduler on the congress-scraper queue.
 * Call once at app startup; BullMQ deduplicates by scheduler ID.
 */
export async function registerCongressCronJob(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    'congress-scraper-cron',
    { pattern: '0 */6 * * *' }, // every 6 hours
    { name: 'run', data: {} },
  )
  console.log('[congress] Cron job registered: 0 */6 * * *')
}

/**
 * Creates and returns the BullMQ Worker that processes congress-scraper jobs.
 * Mount this in your app entry point.
 */
export function createCongressScraperWorker(): Worker {
  return new Worker(
    'congress-scraper',
    async job => {
      console.log(`[congress] Worker received job id=${job.id}`)
      const result = await scrapeCongressBills()
      return result
    },
    {
      connection: getRedisConnection(),
      concurrency: 1, // scraper is single-threaded by design
    },
  )
}
