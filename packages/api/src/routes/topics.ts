import { Hono } from 'hono'
import { db } from '../lib/db.js'
import type { AppEnv } from '../lib/types.js'

const topics = new Hono<AppEnv>()

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopicRow {
  topic: string
  count: bigint
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/topics/trending
 *
 * Returns the top 10 topics by document count over the last 7 days.
 * Unnests the `topics` string[] column and groups by each individual topic.
 *
 * Optional `days` query param overrides the 7-day window (max 90).
 * Optional `level` param narrows to a specific jurisdiction level.
 *
 * @example
 * GET /api/topics/trending
 * GET /api/topics/trending?days=30&level=state
 */
topics.get('/trending', async c => {
  try {
    const days = Math.min(parseInt(c.req.query('days') ?? '7', 10), 90)
    const levelFilter = c.req.query('level')

    const levelClause = levelFilter
      ? `AND level::text = '${levelFilter.replace(/'/g, "''")}'`
      : ''

    // Unnest the topics array and count how many documents reference each topic
    // in the rolling window. Raw SQL is required because Prisma doesn't expose
    // PostgreSQL's unnest() function through its query builder.
    const rows = await db.$queryRawUnsafe<TopicRow[]>(`
      SELECT
        topic,
        COUNT(*) AS count
      FROM
        "CivicDocument",
        unnest(topics) AS topic
      WHERE
        "createdAt" >= NOW() - INTERVAL '${days} days'
        AND topic <> ''
        ${levelClause}
      GROUP BY topic
      ORDER BY count DESC
      LIMIT 10
    `)

    return c.json({
      window_days: days,
      topics: rows.map(r => ({
        topic: r.topic,
        document_count: Number(r.count),
      })),
    })
  } catch (err) {
    console.error('[GET /api/topics/trending]', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default topics
