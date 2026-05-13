import { PrismaClient } from '@civiclens/db'
import { Queue, Worker } from 'bullmq'
import { getRedisConnection, summarizeQueue } from '../queues/index.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://v3.openstates.org'
const PAGE_SIZE = 20
const RATE_LIMIT_MS = 300
const TEXT_FETCH_TIMEOUT_MS = 10_000

// ─── State FIPS lookup ────────────────────────────────────────────────────────

const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09',
  DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17',
  IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24',
  MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31',
  NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38',
  OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46',
  TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54',
  WI: '55', WY: '56',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenStatesPerson {
  id: string
  name: string
  party?: string
  current_role?: {
    title: string
    org_classification: string // "upper" | "lower"
    district: string
    division_id?: string
  }
}

interface OpenStatesSponsorship {
  name: string
  classification: string // "primary" | "cosponsor"
  entity_type: string
  primary: boolean
  person: OpenStatesPerson | null
}

interface OpenStatesVoteCount {
  option: string
  value: number
}

interface OpenStatesVoteRecord {
  option: string // "yes" | "no" | "abstain" | "other" | "absent" | "not voting"
  voter: OpenStatesPerson | null
}

interface OpenStatesVoteEvent {
  id: string
  motion_text: string
  start_date: string | null
  result: string // "pass" | "fail"
  votes: OpenStatesVoteRecord[]
  counts: OpenStatesVoteCount[]
}

interface OpenStatesVersion {
  note: string
  date: string
  links: Array<{ url: string; media_type: string }>
}

interface OpenStatesAction {
  organization: { classification: string } | null
  description: string
  date: string
  classification: string[]
}

interface OpenStatesBill {
  id: string
  session: string
  jurisdiction: { id: string; name: string; classification: string }
  identifier: string
  title: string
  classification: string[]
  subject: string[]
  abstracts: Array<{ abstract: string; note: string }>
  actions: OpenStatesAction[]
  sponsorships: OpenStatesSponsorship[]
  votes: OpenStatesVoteEvent[]
  versions: OpenStatesVersion[]
  sources: Array<{ url: string; note: string }>
  openstates_url: string
}

interface BillsResponse {
  results: OpenStatesBill[]
  pagination: {
    per_page: number
    page: number
    max_page: number
    total_items: number
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJson<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, { headers: { 'X-API-KEY': apiKey } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`)
  return res.json() as Promise<T>
}

/**
 * Maps an OpenStates bill classification array to our DocumentType enum value.
 */
function mapDocumentType(classification: string[]): string {
  const cls = classification.map(c => c.toLowerCase())
  if (
    cls.includes('resolution') ||
    cls.includes('concurrent resolution') ||
    cls.includes('joint resolution') ||
    cls.includes('memorial')
  ) {
    return 'resolution'
  }
  return 'bill'
}

/**
 * Derives DocumentStatus by walking actions newest-first and matching
 * OpenStates action classification tags.
 */
function mapStatus(actions: OpenStatesAction[]): string {
  for (let i = actions.length - 1; i >= 0; i--) {
    const cls = actions[i]!.classification
    if (cls.includes('executive-signature') || cls.includes('became-law')) return 'signed'
    if (cls.includes('executive-veto')) return 'vetoed'
    if (cls.includes('passage')) return 'passed'
    if (cls.includes('failure') || cls.includes('failed')) return 'failed'
    if (cls.includes('referral-committee') || cls.includes('referral')) return 'in_committee'
    if (cls.includes('introduction')) return 'introduced'
  }
  return 'introduced'
}

function mapSponsorRole(classification: string): string {
  return classification === 'primary' ? 'sponsor' : 'cosponsor'
}

function mapVoteRole(option: string): string | null {
  switch (option.toLowerCase()) {
    case 'yes': return 'voted_yes'
    case 'no': return 'voted_no'
    case 'abstain': return 'voted_abstain'
    default: return null // ignore "other", "absent", "not voting"
  }
}

/**
 * Fetches the plain-text content of the most recent HTML bill text version.
 * Returns an empty string on any failure or timeout.
 */
async function fetchBillText(versions: OpenStatesVersion[]): Promise<string> {
  for (const version of [...versions].reverse()) {
    const htmlLink = version.links.find(l => l.media_type === 'text/html')
    if (!htmlLink) continue

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TEXT_FETCH_TIMEOUT_MS)
      const res = await fetch(htmlLink.url, { signal: controller.signal })
      clearTimeout(timer)

      if (!res.ok) continue
      await delay(RATE_LIMIT_MS)

      const html = await res.text()
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    } catch {
      continue
    }
  }
  return ''
}

// ─── Politician upsert ────────────────────────────────────────────────────────

/**
 * Finds or creates a Politician record keyed by their OpenStates person ID.
 * Results are cached in-memory for the duration of a single scrape run to
 * avoid repeated DB round-trips for the same legislator across many bills.
 */
async function upsertPolitician(
  db: PrismaClient,
  person: OpenStatesPerson,
  jurisdiction: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(person.id)
  if (cached) return cached

  // Query by OpenStates person ID stored in the JSON sourceIds field
  const existing = await db.politician.findFirst({
    where: { sourceIds: { path: ['openStatesId'], equals: person.id } },
    select: { id: true },
  })

  if (existing) {
    cache.set(person.id, existing.id)
    return existing.id
  }

  const role = person.current_role
  const created = await db.politician.create({
    data: {
      name: person.name,
      title: role?.title ?? (role?.org_classification === 'upper' ? 'Senator' : 'Representative'),
      party: person.party ?? '',
      district: role?.district ?? '',
      level: 'state' as any,
      jurisdiction,
      sourceIds: { openStatesId: person.id },
    },
    select: { id: true },
  })

  cache.set(person.id, created.id)
  return created.id
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

export interface ScrapeResult {
  state: string
  created: number
  updated: number
  errors: number
}

export async function scrapeStateBills(state: string): Promise<ScrapeResult> {
  const apiKey = process.env.OPENSTATES_API_KEY
  if (!apiKey) throw new Error('OPENSTATES_API_KEY env var is not set')

  const stateUpper = state.toUpperCase()
  const db = new PrismaClient()
  // In-memory deduplication cache for this run: openStatesPersonId → dbPoliticianId
  const politicianCache = new Map<string, string>()

  let created = 0
  let updated = 0
  let errors = 0
  let page = 1
  let maxPage: number | null = null

  console.log(`[openstates:${stateUpper}] Scrape started`)

  try {
    while (true) {
      const url = new URL(`${BASE_URL}/bills`)
      url.searchParams.set('jurisdiction', state.toLowerCase())
      url.searchParams.set('include', 'sponsorships,votes,versions,actions')
      url.searchParams.set('page', String(page))
      url.searchParams.set('per_page', String(PAGE_SIZE))

      console.log(`[openstates:${stateUpper}] Fetching page ${page} / ${maxPage ?? '?'}`)

      const data = await fetchJson<BillsResponse>(url.toString(), apiKey)
      await delay(RATE_LIMIT_MS)

      if (maxPage === null) {
        maxPage = data.pagination.max_page
        console.log(`[openstates:${stateUpper}] Total bills: ${data.pagination.total_items}`)
      }

      const bills = data.results ?? []
      if (!bills.length) break

      for (const bill of bills) {
        try {
          // Sort actions chronologically to derive introduced/last-action dates
          const sortedActions = [...bill.actions].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          )
          const firstAction = sortedActions[0]
          const lastAction = sortedActions[sortedActions.length - 1]

          // Fetch full text; fall back to abstract
          let fullText = await fetchBillText(bill.versions)
          if (!fullText && bill.abstracts.length) {
            fullText = bill.abstracts[0]!.abstract
          }

          const sourceUrl =
            bill.openstates_url ??
            `https://openstates.org/${state.toLowerCase()}/bills/${bill.session}/${bill.identifier}/`

          const jurisdiction = bill.jurisdiction.name
          const fips = STATE_FIPS[stateUpper] ?? null

          const docData = {
            sourceUrl,
            type: mapDocumentType(bill.classification) as any,
            level: 'state' as any,
            jurisdiction,
            jurisdictionFips: fips,
            title: bill.title,
            fullText,
            summary: null,
            status: mapStatus(bill.actions) as any,
            topics: bill.subject ?? [],
            introducedDate: firstAction ? new Date(firstAction.date) : new Date(),
            lastActionDate: lastAction ? new Date(lastAction.date) : new Date(),
          }

          // Upsert document
          const existingDoc = await db.civicDocument.findUnique({
            where: { sourceUrl },
            select: { id: true },
          })

          let documentId: string
          let isNew: boolean

          if (existingDoc) {
            await db.civicDocument.update({ where: { id: existingDoc.id }, data: docData })
            documentId = existingDoc.id
            isNew = false
            updated++
            console.log(`[openstates:${stateUpper}] Updated  ${bill.identifier}`)
          } else {
            const newDoc = await db.civicDocument.create({
              data: docData,
              select: { id: true },
            })
            documentId = newDoc.id
            isNew = true
            created++
            console.log(`[openstates:${stateUpper}] Created  ${bill.identifier}`)
          }

          if (isNew) {
            await summarizeQueue.add('summarize', { documentId })
          }

          // Upsert sponsors → DocumentPolitician
          for (const sponsorship of bill.sponsorships) {
            if (!sponsorship.person?.id) continue
            try {
              const politicianId = await upsertPolitician(
                db,
                sponsorship.person,
                jurisdiction,
                politicianCache,
              )
              const role = mapSponsorRole(sponsorship.classification)
              await db.documentPolitician.upsert({
                where: {
                  documentId_politicianId_role: { documentId, politicianId, role: role as any },
                },
                create: { documentId, politicianId, role: role as any },
                update: {},
              })
            } catch (err) {
              console.warn(`[openstates:${stateUpper}] Sponsor upsert failed for ${bill.identifier}:`, err)
            }
          }

          // Upsert individual vote records → DocumentPolitician
          for (const voteEvent of bill.votes) {
            for (const voteRecord of voteEvent.votes) {
              if (!voteRecord.voter?.id) continue
              const role = mapVoteRole(voteRecord.option)
              if (!role) continue
              try {
                const politicianId = await upsertPolitician(
                  db,
                  voteRecord.voter,
                  jurisdiction,
                  politicianCache,
                )
                await db.documentPolitician.upsert({
                  where: {
                    documentId_politicianId_role: { documentId, politicianId, role: role as any },
                  },
                  create: { documentId, politicianId, role: role as any },
                  update: {},
                })
              } catch (err) {
                console.warn(`[openstates:${stateUpper}] Vote upsert failed for ${bill.identifier}:`, err)
              }
            }
          }
        } catch (err) {
          errors++
          console.error(`[openstates:${stateUpper}] Error processing ${bill.identifier}:`, err)
        }
      }

      if (page >= maxPage) break
      page++
    }
  } finally {
    await db.$disconnect()
  }

  console.log(
    `[openstates:${stateUpper}] Scrape complete — created=${created} updated=${updated} errors=${errors}`,
  )
  return { state: stateUpper, created, updated, errors }
}

// ─── BullMQ cron job ──────────────────────────────────────────────────────────

/**
 * Registers one repeating job scheduler per state on the openstates-scraper queue.
 * Scheduler IDs are state-specific so each state runs independently.
 * Call once at app startup; BullMQ deduplicates by scheduler ID.
 *
 * @example
 *   await registerOpenStatesCronJobs(openStatesScraperQueue, ['CA', 'TX', 'NY'])
 */
export async function registerOpenStatesCronJobs(
  queue: Queue,
  states: string[],
): Promise<void> {
  for (const state of states) {
    const stateUpper = state.toUpperCase()
    await queue.upsertJobScheduler(
      `openstates-${stateUpper}-cron`,
      { pattern: '0 */12 * * *' }, // every 12 hours
      { name: 'scrape-state', data: { state: stateUpper } },
    )
    console.log(`[openstates] Cron registered for ${stateUpper}: 0 */12 * * *`)
  }
}

/**
 * Creates and returns the BullMQ Worker that processes openstates-scraper jobs.
 * A single worker handles all states sequentially (concurrency: 1).
 */
export function createOpenStatesScraperWorker(): Worker {
  return new Worker(
    'openstates-scraper',
    async job => {
      const { state } = job.data as { state: string }
      console.log(`[openstates] Worker received job state=${state} id=${job.id}`)
      return scrapeStateBills(state)
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  )
}
