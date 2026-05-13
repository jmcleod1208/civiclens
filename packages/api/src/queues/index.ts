import { Queue } from 'bullmq'

export function getRedisConnection() {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  }
}

export const congressScraperQueue = new Queue('congress-scraper', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
})

export const openStatesScraperQueue = new Queue('openstates-scraper', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
})

// Stub for prompt 5 — summarization worker reads from this queue
export const summarizeQueue = new Queue('summarize', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
})
