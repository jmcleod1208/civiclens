import { PrismaClient } from '@civiclens/db'
import { Worker } from 'bullmq'
import OpenAI from 'openai'
import { getRedisConnection, getSummarizeQueue } from '../queues/index.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SummarizeJobData {
  documentId: string
  /** Pass true to re-summarize a document that already has a summary. */
  force?: boolean
}

export interface DocumentSummary {
  what_it_proposes: string
  who_it_affects: string
  what_it_means_for_you: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a civic education assistant. Summarize this government document in plain English at an 8th grade reading level. ' +
  'Return a JSON object with exactly three keys: ' +
  "'what_it_proposes' (1 paragraph), " +
  "'who_it_affects' (1 paragraph), " +
  "'what_it_means_for_you' (1 paragraph). " +
  'Be specific, avoid jargon, and focus on practical impact for everyday citizens.'

// Truncate fullText to stay within GPT-4o's context window while leaving
// room for the system prompt and response. ~12k words ≈ ~16k tokens.
const MAX_TEXT_CHARS = 48_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY env var is not set')
  return key
}

/**
 * GPT-4o sometimes wraps its JSON response in a markdown code fence.
 * Strip it before parsing so JSON.parse doesn't choke.
 */
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) return fenceMatch[1]!.trim()
  // Try to find the outermost { ... } if there's surrounding prose
  const braceMatch = raw.match(/\{[\s\S]*\}/)
  if (braceMatch) return braceMatch[0]
  return raw.trim()
}

/**
 * Validates that the parsed object has all three required string fields.
 * Throws a descriptive error if any field is missing or not a string.
 */
function validateSummary(obj: unknown): DocumentSummary {
  if (!obj || typeof obj !== 'object') {
    throw new Error('OpenAI response is not an object')
  }
  const keys: Array<keyof DocumentSummary> = [
    'what_it_proposes',
    'who_it_affects',
    'what_it_means_for_you',
  ]
  for (const k of keys) {
    if (typeof (obj as Record<string, unknown>)[k] !== 'string') {
      throw new Error(`OpenAI response missing or invalid field: "${k}"`)
    }
  }
  return obj as DocumentSummary
}

// ─── Core summarization logic ─────────────────────────────────────────────────

/**
 * Calls GPT-4o and returns a validated DocumentSummary.
 * Throws on any API or validation error — BullMQ retries the job on throw.
 */
export async function summarizeDocument(
  documentId: string,
  fullText: string,
  title: string,
): Promise<DocumentSummary> {
  const client = new OpenAI({ apiKey: requireApiKey() })

  const userContent =
    `Title: ${title}\n\n` +
    `Full text:\n${fullText.slice(0, MAX_TEXT_CHARS)}` +
    (fullText.length > MAX_TEXT_CHARS ? '\n\n[Document truncated for length]' : '')

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) throw new Error('OpenAI returned an empty response')

  const jsonStr = extractJson(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    throw new Error(`Failed to parse OpenAI JSON response: ${(err as Error).message}. Raw: ${raw.slice(0, 200)}`)
  }

  return validateSummary(parsed)
}

// ─── BullMQ worker ────────────────────────────────────────────────────────────

/**
 * Processes a single summarize job.
 * - Skips documents that already have a summary (unless force=true).
 * - Throws on any failure so BullMQ applies the 3-attempt exponential-backoff
 *   retry configured on the queue.
 */
async function processSummarizeJob(data: SummarizeJobData): Promise<void> {
  const { documentId, force = false } = data
  const db = new PrismaClient()

  try {
    const doc = await db.civicDocument.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, fullText: true, summary: true },
    })

    if (!doc) {
      // Document was deleted between enqueue and processing — nothing to do.
      console.log(`[summarize] Document ${documentId} not found; skipping`)
      return
    }

    if (doc.summary && !force) {
      console.log(`[summarize] Document ${documentId} already has a summary; skipping`)
      return
    }

    if (!doc.fullText.trim()) {
      console.log(`[summarize] Document ${documentId} has empty fullText; skipping`)
      return
    }

    console.log(`[summarize] Summarizing document ${documentId}: "${doc.title.slice(0, 60)}..."`)

    const summary = await summarizeDocument(documentId, doc.fullText, doc.title)

    await db.civicDocument.update({
      where: { id: documentId },
      data: { summary: JSON.stringify(summary) },
    })

    console.log(`[summarize] Done for document ${documentId}`)
  } finally {
    await db.$disconnect()
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** The summarize queue — enqueue jobs here from scrapers or API routes. */
export { getSummarizeQueue as summarizeQueue }

/**
 * Creates and starts the BullMQ worker that processes summarize jobs.
 * Call once at app startup.
 *
 * @example
 *   import { startWorker } from './jobs/summarize.js'
 *   const worker = startWorker()
 *   process.on('SIGTERM', () => worker.close())
 */
export function startWorker(): Worker {
  const worker = new Worker<SummarizeJobData>(
    'summarize',
    async job => {
      console.log(`[summarize] Processing job id=${job.id} documentId=${job.data.documentId}`)
      await processSummarizeJob(job.data)
    },
    {
      connection: getRedisConnection(),
      concurrency: 3, // summarize 3 docs in parallel; GPT-4o handles concurrent requests fine
    },
  )

  worker.on('completed', job => {
    console.log(`[summarize] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    const attempt = job?.attemptsMade ?? '?'
    const max = job?.opts?.attempts ?? 3
    console.error(`[summarize] Job ${job?.id} failed (attempt ${attempt}/${max}): ${err.message}`)
  })

  return worker
}
