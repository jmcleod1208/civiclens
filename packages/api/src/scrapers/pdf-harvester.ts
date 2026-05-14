import { PrismaClient } from '@civiclens/db'
import { chromium } from 'playwright'
import { getProcessPdfQueue } from '../queues/index.js'
import type { ProcessPdfJobData } from '../jobs/process-pdf.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HarvestOptions {
  /** URL of the school district's "Board Meetings" or agenda page. */
  pageUrl: string
  /** Full jurisdiction name, e.g. "Dublin City School District, OH". */
  jurisdiction: string
  /** Defaults to "school_board". */
  level?: 'school_board' | 'county' | 'city' | 'state' | 'federal'
  jurisdictionFips?: string
}

export interface HarvestResult {
  enqueued: number
  skipped: number
  errors: number
  pdfs: HarvestedPdf[]
}

interface HarvestedPdf {
  url: string
  title: string
  type: 'agenda' | 'minutes'
  date: Date
}

/** Raw link data scraped from the browser. */
interface RawPdfLink {
  url: string
  text: string
  /** Text of the nearest table row, list item, or div — for date/type context. */
  context: string
}

// ─── Inference helpers ────────────────────────────────────────────────────────

const MONTHS_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
const DATE_PATTERNS = [
  // "January 15, 2025" | "January 15 2025"
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/i,
  // "01/15/2025" | "1-15-2025"
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/,
  // ISO "2025-01-15"
  /\b\d{4}-\d{2}-\d{2}\b/,
  // "15 January 2025"
  /\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i,
]

function inferDate(text: string, context: string): Date {
  const combined = `${text} ${context}`
  for (const pattern of DATE_PATTERNS) {
    const match = combined.match(pattern)
    if (match) {
      const d = new Date(match[0])
      if (!isNaN(d.getTime())) return d
    }
  }
  // Fall back to today — process-pdf can't do better from just a URL
  return new Date()
}

function inferType(text: string, url: string): 'agenda' | 'minutes' {
  const combined = `${text} ${url}`.toLowerCase()
  if (
    combined.includes('minute') ||
    combined.includes('approved') ||
    combined.includes('official')
  ) {
    return 'minutes'
  }
  return 'agenda'
}

function inferTitle(link: RawPdfLink): string {
  if (link.text.length > 3) return link.text.replace(/\s+/g, ' ').slice(0, 200)
  // Fall back to the filename from the URL
  const filename = decodeURIComponent(link.url.split('/').pop() ?? link.url)
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  return filename || 'Board Meeting Document'
}

// ─── Browser scraping ─────────────────────────────────────────────────────────

/**
 * Launches a headless Chromium browser, navigates to `pageUrl`, and returns
 * every PDF link found on the page along with surrounding context text.
 * Handles JavaScript-rendered pages (e.g. Angular/React board-meeting portals).
 */
async function scrapePdfLinks(pageUrl: string): Promise<RawPdfLink[]> {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(30_000)

    await page.goto(pageUrl, { waitUntil: 'networkidle' })

    const links = await page.evaluate((): RawPdfLink[] => {
      const anchors = Array.from(document.querySelectorAll('a'))
      return anchors
        .filter(a => {
          const href = (a.href ?? '').toLowerCase()
          return (
            href.startsWith('http') &&
            (href.endsWith('.pdf') || href.includes('.pdf?') || href.includes('/pdf/'))
          )
        })
        .map(a => {
          // Walk up to find the nearest semantic container for date context
          let contextEl: Element | null = a
          for (const selector of ['tr', 'li', 'article', '[class*="meeting"]', 'div']) {
            const parent = a.closest(selector)
            if (parent && parent !== document.body) {
              contextEl = parent
              break
            }
          }
          return {
            url: a.href,
            text: (a.textContent ?? '').trim().replace(/\s+/g, ' '),
            context: (contextEl?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 400),
          }
        })
    })

    // De-duplicate by URL
    const seen = new Set<string>()
    return links.filter(l => {
      if (seen.has(l.url)) return false
      seen.add(l.url)
      return true
    })
  } finally {
    await browser.close()
  }
}

// ─── DB upsert + job enqueue ──────────────────────────────────────────────────

async function upsertStubAndEnqueue(
  pdf: HarvestedPdf,
  options: HarvestOptions,
  db: PrismaClient,
): Promise<'enqueued' | 'skipped' | 'error'> {
  const level = (options.level ?? 'school_board') as any

  try {
    // Check if a document already exists for this PDF URL
    const existing = await db.civicDocument.findUnique({
      where: { sourceUrl: pdf.url },
      select: { id: true, fullText: true },
    })

    let documentId: string

    if (existing) {
      // Skip if already processed (has real content)
      if (existing.fullText.length > 100) {
        console.log(`[pdf-harvester] ${pdf.url} already processed — skipping`)
        return 'skipped'
      }
      documentId = existing.id
      console.log(`[pdf-harvester] ${pdf.url} stub exists — re-enqueuing process-pdf`)
    } else {
      // Create a lightweight stub so process-pdf can update it in place
      const created = await db.civicDocument.create({
        data: {
          type: pdf.type as any,
          level,
          jurisdiction: options.jurisdiction,
          jurisdictionFips: options.jurisdictionFips ?? null,
          title: pdf.title,
          fullText: '',   // placeholder; process-pdf fills this in
          summary: null,
          status: 'introduced' as any,
          topics: [],
          sourceUrl: pdf.url,
          introducedDate: pdf.date,
          lastActionDate: pdf.date,
        },
        select: { id: true },
      })
      documentId = created.id
      console.log(`[pdf-harvester] Created stub document ${documentId} for ${pdf.url}`)
    }

    // Enqueue the PDF extraction job
    const jobData: ProcessPdfJobData = { pdfUrl: pdf.url, documentId }
    await getProcessPdfQueue().add('process-pdf', jobData)
    return 'enqueued'
  } catch (err) {
    console.error(`[pdf-harvester] Error processing ${pdf.url}:`, (err as Error).message)
    return 'error'
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Harvests PDF links from a board-meetings page, creates stub CivicDocuments
 * for each PDF not yet in the database, and enqueues a `process-pdf` job for
 * every new (or not-yet-processed) document.
 *
 * @example
 * const result = await harvestPdfs({
 *   pageUrl: 'https://dublinschools.net/Page/2815',
 *   jurisdiction: 'Dublin City School District, OH',
 * })
 * console.log(`Enqueued ${result.enqueued} PDF jobs`)
 */
export async function harvestPdfs(options: HarvestOptions): Promise<HarvestResult> {
  console.log(`[pdf-harvester] Scraping ${options.pageUrl}`)

  // ── 1. Find all PDF links on the page ────────────────────────────────────
  const rawLinks = await scrapePdfLinks(options.pageUrl)
  console.log(`[pdf-harvester] Found ${rawLinks.length} PDF link(s)`)

  if (rawLinks.length === 0) {
    return { enqueued: 0, skipped: 0, errors: 0, pdfs: [] }
  }

  // ── 2. Infer metadata for each link ──────────────────────────────────────
  const pdfs: HarvestedPdf[] = rawLinks.map(link => ({
    url: link.url,
    title: inferTitle(link),
    type: inferType(link.text, link.url),
    date: inferDate(link.text, link.context),
  }))

  // ── 3. Upsert stubs and enqueue jobs ─────────────────────────────────────
  const db = new PrismaClient()
  let enqueued = 0
  let skipped = 0
  let errors = 0

  try {
    for (const pdf of pdfs) {
      const outcome = await upsertStubAndEnqueue(pdf, options, db)
      if (outcome === 'enqueued') enqueued++
      else if (outcome === 'skipped') skipped++
      else errors++
    }
  } finally {
    await db.$disconnect()
  }

  console.log(
    `[pdf-harvester] Done — enqueued=${enqueued} skipped=${skipped} errors=${errors}`,
  )
  return { enqueued, skipped, errors, pdfs }
}
