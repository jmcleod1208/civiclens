import { PrismaClient } from '@civiclens/db'
import { Queue, Worker } from 'bullmq'
import { getRedisConnection, getSummarizeQueue } from '../queues/index.js'

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

/**
 * OpenStates v3 requires either a full state name or an OCD jurisdiction ID
 * in the `jurisdiction` query param — two-letter abbreviations return 422.
 * We accept either input and convert as needed.
 */
const STATE_ABBR_TO_OCD: Record<string, string> = {
  AL: 'ocd-jurisdiction/country:us/state:al/government',
  AK: 'ocd-jurisdiction/country:us/state:ak/government',
  AZ: 'ocd-jurisdiction/country:us/state:az/government',
  AR: 'ocd-jurisdiction/country:us/state:ar/government',
  CA: 'ocd-jurisdiction/country:us/state:ca/government',
  CO: 'ocd-jurisdiction/country:us/state:co/government',
  CT: 'ocd-jurisdiction/country:us/state:ct/government',
  DE: 'ocd-jurisdiction/country:us/state:de/government',
  DC: 'ocd-jurisdiction/country:us/district:dc/government',
  FL: 'ocd-jurisdiction/country:us/state:fl/government',
  GA: 'ocd-jurisdiction/country:us/state:ga/government',
  HI: 'ocd-jurisdiction/country:us/state:hi/government',
  ID: 'ocd-jurisdiction/country:us/state:id/government',
  IL: 'ocd-jurisdiction/country:us/state:il/government',
  IN: 'ocd-jurisdiction/country:us/state:in/government',
  IA: 'ocd-jurisdiction/country:us/state:ia/government',
  KS: 'ocd-jurisdiction/country:us/state:ks/government',
  KY: 'ocd-jurisdiction/country:us/state:ky/government',
  LA: 'ocd-jurisdiction/country:us/state:la/government',
  ME: 'ocd-jurisdiction/country:us/state:me/government',
  MD: 'ocd-jurisdiction/country:us/state:md/government',
  MA: 'ocd-jurisdiction/country:us/state:ma/government',
  MI: 'ocd-jurisdiction/country:us/state:mi/government',
  MN: 'ocd-jurisdiction/country:us/state:mn/government',
  MS: 'ocd-jurisdiction/country:us/state:ms/government',
  MO: 'ocd-jurisdiction/country:us/state:mo/government',
  MT: 'ocd-jurisdiction/country:us/state:mt/government',
  NE: 'ocd-jurisdiction/country:us/state:ne/government',
  NV: 'ocd-jurisdiction/country:us/state:nv/government',
  NH: 'ocd-jurisdiction/country:us/state:nh/government',
  NJ: 'ocd-jurisdiction/country:us/state:nj/government',
  NM: 'ocd-jurisdiction/country:us/state:nm/government',
  NY: 'ocd-jurisdiction/country:us/state:ny/government',
  NC: 'ocd-jurisdiction/country:us/state:nc/government',
  ND: 'ocd-jurisdiction/country:us/state:nd/government',
  OH: 'ocd-jurisdiction/country:us/state:oh/government',
  OK: 'ocd-jurisdiction/country:us/state:ok/government',
  OR: 'ocd-jurisdiction/country:us/state:or/government',
  PA: 'ocd-jurisdiction/country:us/state:pa/government',
  RI: 'ocd-jurisdiction/country:us/state:ri/government',
  SC: 'ocd-jurisdiction/country:us/state:sc/government',
  SD: 'ocd-jurisdiction/country:us/state:sd/government',
  TN: 'ocd-jurisdiction/country:us/state:tn/government',
  TX: 'ocd-jurisdiction/country:us/state:tx/government',
  UT: 'ocd-jurisdiction/country:us/state:ut/government',
  VT: 'ocd-jurisdiction/country:us/state:vt/government',
  VA: 'ocd-jurisdiction/country:us/state:va/government',
  WA: 'ocd-jurisdiction/country:us/state:wa/government',
  WV: 'ocd-jurisdiction/country:us/state:wv/government',
  WI: 'ocd-jurisdiction/country:us/state:wi/government',
  WY: 'ocd-jurisdiction/country:us/state:wy/government',
}

function resolveJurisdiction(input: string): string {
  const upper = input.toUpperCase()
  if (STATE_ABBR_TO_OCD[upper]) return STATE_ABBR_TO_OCD[upper]
  // Pass through OCD IDs and full state names unchanged
  return input.toLowerCase()
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenStatesPerson {
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

export interface OpenStatesSponsorship {
  name: string
  classification: string // "primary" | "cosponsor"
  entity_type: string
  primary: boolean
  person: OpenStatesPerson | null
}

export interface OpenStatesVoteRecord {
  option: string // "yes" | "no" | "abstain" | "other" | "absent" | "not voting"
  voter: OpenStatesPerson | null
}

export interface OpenStatesVoteEvent {
  id: string
  motion_text: string
  start_date: string | null
  result: string
  votes: OpenStatesVoteRecord[]
  counts: Array<{ option: string; value: number }>
}

export interface OpenStatesVersion {
  note: string
  date: string
  links: Array<{ url: string; media_type: string }>
}

export interface OpenStatesAction {
  organization: { classification: string } | null
  description: string
  date: string
  classification: string[]
}

export interface OpenStatesBill {
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

export interface ParsedBill {
  raw: OpenStatesBill
  fullText: string
}

export interface NormalizedPolitician {
  openStatesId: string
  name: string
  title: string
  party: string
  district: string
  jurisdiction: string
}

export interface NormalizedRole {
  openStatesId: string
  role: string
}

export interface NormalizedStateBill {
  document: {
    sourceUrl: string
    type: string
    level: 'state'
    jurisdiction: string
    jurisdictionFips: string | null
    title: string
    fullText: string
    summary: null
    status: string
    topics: string[]
    introducedDate: Date
    lastActionDate: Date
  }
  politicians: NormalizedPolitician[]
  roles: NormalizedRole[]
}

export interface ScrapeResult {
  state: string
  created: number
  updated: number
  errors: number
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
    default: return null
  }
}

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

function buildPolitician(
  person: OpenStatesPerson,
  jurisdiction: string,
): NormalizedPolitician {
  const role = person.current_role
  return {
    openStatesId: person.id,
    name: person.name,
    title: role?.title ?? (role?.org_classification === 'upper' ? 'Senator' : 'Representative'),
    party: person.party ?? '',
    district: role?.district ?? '',
    jurisdiction,
  }
}

function requireApiKey(): string {
  const key = process.env.OPENSTATES_API_KEY
  if (!key) throw new Error('OPENSTATES_API_KEY env var is not set')
  return key
}

// ─── DB upsert helper for politicians ─────────────────────────────────────────

/**
 * Finds or creates a Politician keyed by their OpenStates person ID.
 * Cache lives for one upsertAll call so repeated lookups within a single
 * scrape don't hit the DB more than necessary.
 */
async function upsertPolitician(
  db: PrismaClient,
  p: NormalizedPolitician,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(p.openStatesId)
  if (cached) return cached

  const existing = await db.politician.findFirst({
    where: { sourceIds: { path: ['openStatesId'], equals: p.openStatesId } },
    select: { id: true },
  })

  if (existing) {
    cache.set(p.openStatesId, existing.id)
    return existing.id
  }

  const created = await db.politician.create({
    data: {
      name: p.name,
      title: p.title,
      party: p.party,
      district: p.district,
      level: 'state' as any,
      jurisdiction: p.jurisdiction,
      sourceIds: { openStatesId: p.openStatesId },
    },
    select: { id: true },
  })

  cache.set(p.openStatesId, created.id)
  return created.id
}

// ─── Structured scraper object ────────────────────────────────────────────────

export const openstatesScraper = {
  /**
   * Fetches one page of bills for a given state.
   * Includes sponsorships, votes, versions, and actions inline.
   */
  async fetch(state: string, page = 1, perPage = PAGE_SIZE): Promise<OpenStatesBill[]> {
    const apiKey = requireApiKey()
    const url = new URL(`${BASE_URL}/bills`)
    url.searchParams.set('jurisdiction', resolveJurisdiction(state))
    // OpenStates expects repeated include= params, not comma-separated
    for (const inc of ['sponsorships', 'votes', 'versions', 'actions']) {
      url.searchParams.append('include', inc)
    }
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(perPage))

    console.log(`[openstates:${state.toUpperCase()}] Fetching page ${page} (${perPage}/page)`)
    const data = await fetchJson<BillsResponse>(url.toString(), apiKey)
    await delay(RATE_LIMIT_MS)
    return data.results ?? []
  },

  /**
   * Enriches each raw bill with its full text. Errors per bill are logged
   * and the bill is kept with an empty fullText.
   */
  async parse(raw: OpenStatesBill[]): Promise<ParsedBill[]> {
    const results: ParsedBill[] = []
    for (const bill of raw) {
      let fullText = ''
      try {
        fullText = await fetchBillText(bill.versions)
      } catch (err) {
        console.warn(`[openstates] parse: text fetch failed for ${bill.identifier}:`, err)
      }
      if (!fullText && bill.abstracts?.length) {
        fullText = bill.abstracts[0]!.abstract
      }
      results.push({ raw: bill, fullText })
    }
    return results
  },

  /**
   * Pure mapping — no I/O. Each parsed bill produces a document plus the
   * list of politicians involved and their roles for that document.
   */
  normalize(state: string, parsed: ParsedBill[]): NormalizedStateBill[] {
    const stateUpper = state.toUpperCase()
    const fips = STATE_FIPS[stateUpper] ?? null

    return parsed.map(({ raw, fullText }) => {
      const sortedActions = [...raw.actions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
      const firstAction = sortedActions[0]
      const lastAction = sortedActions[sortedActions.length - 1]
      const jurisdiction = raw.jurisdiction.name

      const sourceUrl =
        raw.openstates_url ??
        `https://openstates.org/${state.toLowerCase()}/bills/${raw.session}/${raw.identifier}/`

      const politicianMap = new Map<string, NormalizedPolitician>()
      const roles: NormalizedRole[] = []

      for (const sponsorship of raw.sponsorships) {
        if (!sponsorship.person?.id) continue
        const p = buildPolitician(sponsorship.person, jurisdiction)
        if (!politicianMap.has(p.openStatesId)) politicianMap.set(p.openStatesId, p)
        roles.push({
          openStatesId: p.openStatesId,
          role: mapSponsorRole(sponsorship.classification),
        })
      }

      for (const voteEvent of raw.votes) {
        for (const voteRecord of voteEvent.votes) {
          if (!voteRecord.voter?.id) continue
          const role = mapVoteRole(voteRecord.option)
          if (!role) continue
          const p = buildPolitician(voteRecord.voter, jurisdiction)
          if (!politicianMap.has(p.openStatesId)) politicianMap.set(p.openStatesId, p)
          roles.push({ openStatesId: p.openStatesId, role })
        }
      }

      return {
        document: {
          sourceUrl,
          type: mapDocumentType(raw.classification),
          level: 'state' as const,
          jurisdiction,
          jurisdictionFips: fips,
          title: raw.title,
          fullText,
          summary: null,
          status: mapStatus(raw.actions),
          topics: raw.subject ?? [],
          introducedDate: firstAction ? new Date(firstAction.date) : new Date(),
          lastActionDate: lastAction ? new Date(lastAction.date) : new Date(),
        },
        politicians: Array.from(politicianMap.values()),
        roles,
      }
    })
  },

  /**
   * Persists everything: document upsert, politician upsert, document-politician
   * joins. New documents are enqueued for summarization (silently skipped if
   * Redis isn't running).
   */
  async upsertAll(state: string, items: NormalizedStateBill[]): Promise<ScrapeResult> {
    const stateUpper = state.toUpperCase()
    const db = new PrismaClient()
    const politicianCache = new Map<string, string>()
    let created = 0
    let updated = 0
    let errors = 0

    try {
      for (const item of items) {
        try {
          const existing = await db.civicDocument.findUnique({
            where: { sourceUrl: item.document.sourceUrl },
            select: { id: true },
          })

          let documentId: string
          let isNew: boolean

          if (existing) {
            await db.civicDocument.update({
              where: { id: existing.id },
              data: item.document as any,
            })
            documentId = existing.id
            isNew = false
            updated++
          } else {
            const newDoc = await db.civicDocument.create({
              data: item.document as any,
              select: { id: true },
            })
            documentId = newDoc.id
            isNew = true
            created++
          }

          if (isNew) {
            try {
              await getSummarizeQueue().add('summarize', { documentId })
            } catch {
              // Redis may not be running in test environments — non-fatal
            }
          }

          for (const p of item.politicians) {
            await upsertPolitician(db, p, politicianCache)
          }

          for (const r of item.roles) {
            const politicianId = politicianCache.get(r.openStatesId)
            if (!politicianId) continue
            await db.documentPolitician.upsert({
              where: {
                documentId_politicianId_role: { documentId, politicianId, role: r.role as any },
              },
              create: { documentId, politicianId, role: r.role as any },
              update: {},
            })
          }
        } catch (err) {
          errors++
          console.error(`[openstates:${stateUpper}] upsertAll: error on ${item.document.sourceUrl}:`, err)
        }
      }
    } finally {
      await db.$disconnect()
    }

    console.log(
      `[openstates:${stateUpper}] upsertAll complete — created=${created} updated=${updated} errors=${errors}`,
    )
    return { state: stateUpper, created, updated, errors }
  },
}

// ─── Full paginated scrape (used by the cron worker) ──────────────────────────

export async function scrapeStateBills(state: string): Promise<ScrapeResult> {
  const stateUpper = state.toUpperCase()
  let totalCreated = 0
  let totalUpdated = 0
  let totalErrors = 0
  let page = 1
  let maxPage: number | null = null

  console.log(`[openstates:${stateUpper}] Full scrape started`)

  while (true) {
    const raw = await openstatesScraper.fetch(state, page)
    if (!raw.length) break

    // BillsResponse pagination needs a separate call to know max_page — but
    // we already have it from the first call. Re-fetch the pagination object
    // by inspecting page length: if fewer than PAGE_SIZE results, this is the
    // last page.
    const parsed = await openstatesScraper.parse(raw)
    const normalized = openstatesScraper.normalize(state, parsed)
    const result = await openstatesScraper.upsertAll(state, normalized)

    totalCreated += result.created
    totalUpdated += result.updated
    totalErrors += result.errors

    if (raw.length < PAGE_SIZE) break
    if (maxPage !== null && page >= maxPage) break
    page++
  }

  console.log(
    `[openstates:${stateUpper}] Full scrape complete — created=${totalCreated} updated=${totalUpdated} errors=${totalErrors}`,
  )
  return { state: stateUpper, created: totalCreated, updated: totalUpdated, errors: totalErrors }
}

// ─── BullMQ cron job ──────────────────────────────────────────────────────────

export async function registerOpenStatesCronJobs(
  queue: Queue,
  states: string[],
): Promise<void> {
  for (const state of states) {
    const stateUpper = state.toUpperCase()
    await queue.upsertJobScheduler(
      `openstates-${stateUpper}-cron`,
      { pattern: '0 */12 * * *' },
      { name: 'scrape-state', data: { state: stateUpper } },
    )
    console.log(`[openstates] Cron registered for ${stateUpper}: 0 */12 * * *`)
  }
}

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
