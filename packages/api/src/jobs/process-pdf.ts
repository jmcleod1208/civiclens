import { PrismaClient } from '@civiclens/db'
import { Worker } from 'bullmq'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getRedisConnection, getProcessPdfQueue, getSummarizeQueue } from '../queues/index.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessPdfJobData {
  pdfUrl: string
  documentId: string
  /** Pass true to re-extract even if fullText is already populated. */
  force?: boolean
}

interface ExtractionItem {
  title: string
  description: string | null
  vote_result: 'passed' | 'failed' | 'tabled' | null
  affected_parties: string | null
  item_type: 'agenda_item' | 'motion' | 'vote' | 'action_item'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT =
  'Extract all agenda items, motions, votes, and action items from this government document. ' +
  'Return a JSON array where each item has: ' +
  '{ title, description, vote_result (passed/failed/tabled/null), affected_parties, ' +
  'item_type (agenda_item/motion/vote/action_item) }'

/**
 * If fullText already has this many characters we consider the PDF already
 * processed and skip extraction (unless force=true).
 */
const PROCESSED_THRESHOLD = 100

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireApiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('GOOGLE_AI_API_KEY env var is not set')
  return key
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Gemini sometimes wraps JSON in a markdown code fence or adds prose before
 * the array. Strip the fence and find the outermost JSON array.
 */
function extractJsonArray(raw: string): string {
  // Strip ```json … ``` fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) return fenceMatch[1]!.trim()
  // Find the outermost [ … ] if there's surrounding prose
  const arrayMatch = raw.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return raw.trim()
}

/**
 * Converts the extracted JSON items into readable plain text suitable for the
 * downstream summarizer. Each item becomes a labeled paragraph.
 */
function itemsToFullText(items: ExtractionItem[]): string {
  return items
    .map(item => {
      const label = item.item_type.replace(/_/g, ' ').toUpperCase()
      const lines = [`[${label}] ${item.title}`]
      if (item.description) lines.push(`Description: ${item.description}`)
      if (item.vote_result) lines.push(`Vote Result: ${item.vote_result}`)
      if (item.affected_parties) lines.push(`Affected: ${item.affected_parties}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

/** Download a PDF from a URL to a local temp file and return the path. */
async function downloadPdf(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/pdf,*/*;q=0.8',
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to download PDF from ${url}: HTTP ${res.status} ${res.statusText}`)
  }
  const buffer = await res.arrayBuffer()
  fs.writeFileSync(destPath, Buffer.from(buffer))
  console.log(
    `[process-pdf] Downloaded ${(buffer.byteLength / 1024).toFixed(1)} KB to ${destPath}`,
  )
}

// ─── Core extraction logic ────────────────────────────────────────────────────

/**
 * Downloads the PDF at `pdfUrl`, sends it to Gemini 2.0 Flash via the Files
 * API, extracts structured agenda/vote/motion data, and returns the result as
 * formatted plain text ready for storage as `fullText`.
 *
 * The temp file and the Gemini File object are always cleaned up, even on
 * failure — so this function is safe to call from a retry loop.
 */
export async function extractPdfContent(pdfUrl: string, documentId: string): Promise<string> {
  const apiKey = requireApiKey()
  const tmpPath = path.join(os.tmpdir(), `civiclens-pdf-${documentId}.pdf`)
  const fileManager = new GoogleAIFileManager(apiKey)
  const genAI = new GoogleGenerativeAI(apiKey)
  let geminiFileName: string | undefined

  try {
    // ── 1. Download PDF ──────────────────────────────────────────────────────
    await downloadPdf(pdfUrl, tmpPath)

    // ── 2. Upload to Gemini Files API ────────────────────────────────────────
    console.log(`[process-pdf] Uploading to Gemini Files API…`)
    const uploadResult = await fileManager.uploadFile(tmpPath, {
      mimeType: 'application/pdf',
      displayName: `civiclens-${documentId}.pdf`,
    })
    let geminiFile = uploadResult.file
    geminiFileName = geminiFile.name

    // ── 3. Poll until the file is active ────────────────────────────────────
    let attempts = 0
    while (geminiFile.state === 'PROCESSING' && attempts < 30) {
      await sleep(2_000)
      geminiFile = await fileManager.getFile(geminiFile.name)
      attempts++
    }
    if (geminiFile.state !== 'ACTIVE') {
      throw new Error(`Gemini file never became active (state=${geminiFile.state})`)
    }
    console.log(`[process-pdf] File active after ${attempts} poll(s): ${geminiFile.uri}`)

    // ── 4. Extract content with Gemini 2.0 Flash ────────────────────────────
    console.log(`[process-pdf] Calling Gemini 2.0 Flash for extraction…`)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent([
      { fileData: { mimeType: geminiFile.mimeType, fileUri: geminiFile.uri } },
      { text: EXTRACTION_PROMPT },
    ])
    const rawText = result.response.text()

    // ── 5. Parse the JSON array ──────────────────────────────────────────────
    const jsonStr = extractJsonArray(rawText)
    let items: ExtractionItem[]
    try {
      const parsed = JSON.parse(jsonStr)
      items = Array.isArray(parsed) ? (parsed as ExtractionItem[]) : []
    } catch (err) {
      // Gemini returned unparseable text — store as-is so fullText isn't empty.
      console.warn(
        `[process-pdf] JSON parse failed, storing raw text. Error: ${(err as Error).message}`,
      )
      return rawText.trim()
    }

    console.log(`[process-pdf] Extracted ${items.length} items from PDF`)
    return itemsToFullText(items)
  } finally {
    // ── Cleanup: always delete the temp file and Gemini file ─────────────────
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // Temp file may not have been created if download failed — ignore.
    }
    if (geminiFileName) {
      try {
        await fileManager.deleteFile(geminiFileName)
      } catch (err) {
        console.warn(`[process-pdf] Could not delete Gemini file ${geminiFileName}: ${(err as Error).message}`)
      }
    }
  }
}

// ─── BullMQ job handler ───────────────────────────────────────────────────────

async function processJob(data: ProcessPdfJobData): Promise<void> {
  const { pdfUrl, documentId, force = false } = data
  const db = new PrismaClient()

  try {
    const doc = await db.civicDocument.findUnique({
      where: { id: documentId },
      select: { id: true, fullText: true, summary: true },
    })

    if (!doc) {
      console.log(`[process-pdf] Document ${documentId} not found; skipping`)
      return
    }

    if (doc.fullText.length >= PROCESSED_THRESHOLD && !force) {
      console.log(`[process-pdf] Document ${documentId} already has fullText; skipping`)
      return
    }

    console.log(`[process-pdf] Processing PDF for document ${documentId}: ${pdfUrl}`)
    const fullText = await extractPdfContent(pdfUrl, documentId)

    await db.civicDocument.update({
      where: { id: documentId },
      data: { fullText },
    })
    console.log(
      `[process-pdf] Stored ${fullText.length} chars of fullText for document ${documentId}`,
    )

    // Enqueue summarization now that we have content
    if (fullText.trim().length > 0 && !doc.summary) {
      try {
        await getSummarizeQueue().add('summarize', { documentId })
        console.log(`[process-pdf] Enqueued summarize job for document ${documentId}`)
      } catch (err) {
        console.warn(`[process-pdf] Could not enqueue summarize job: ${(err as Error).message}`)
      }
    }
  } finally {
    await db.$disconnect()
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** The process-pdf queue. Enqueue jobs here from scrapers or the harvester. */
export { getProcessPdfQueue as processPdfQueue }

/**
 * Creates and starts the BullMQ worker that processes PDF extraction jobs.
 * Call once at app startup.
 *
 * @example
 *   import { startWorker } from './jobs/process-pdf.js'
 *   const worker = startWorker()
 *   process.on('SIGTERM', () => worker.close())
 */
export function startWorker(): Worker {
  const worker = new Worker<ProcessPdfJobData>(
    'process-pdf',
    async job => {
      console.log(
        `[process-pdf] Processing job id=${job.id} documentId=${job.data.documentId}`,
      )
      await processJob(job.data)
    },
    {
      connection: getRedisConnection(),
      // Keep concurrency at 1 to avoid saturating Gemini Files API quota
      concurrency: 1,
    },
  )

  worker.on('completed', job => {
    console.log(`[process-pdf] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    const attempt = job?.attemptsMade ?? '?'
    const max = job?.opts?.attempts ?? 3
    console.error(
      `[process-pdf] Job ${job?.id} failed (attempt ${attempt}/${max}): ${err.message}`,
    )
  })

  return worker
}
