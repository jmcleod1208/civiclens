import { Queue } from 'bullmq'

export function getRedisConnection() {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  }
}

// ─── Lazy singletons ──────────────────────────────────────────────────────────
// Queues are created on first access rather than at module load time.
// This prevents eager Redis connections from crashing test and dev scripts
// that don't actually need the queue.

let _congressScraperQueue: Queue | undefined
let _openStatesScraperQueue: Queue | undefined
let _summarizeQueue: Queue | undefined

export function getCongressScraperQueue(): Queue {
  return (_congressScraperQueue ??= new Queue('congress-scraper', {
    connection: getRedisConnection(),
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
  }))
}

export function getOpenStatesScraperQueue(): Queue {
  return (_openStatesScraperQueue ??= new Queue('openstates-scraper', {
    connection: getRedisConnection(),
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
  }))
}

export function getSummarizeQueue(): Queue {
  return (_summarizeQueue ??= new Queue('summarize', {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  }))
}

// Convenience re-exports used by the cron registration helpers
export { getCongressScraperQueue as congressScraperQueue }
export { getOpenStatesScraperQueue as openStatesScraperQueue }
