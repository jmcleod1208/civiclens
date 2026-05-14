import { Hono } from 'hono'
import { Prisma } from '@civiclens/db'
import { db } from '../lib/db.js'
import { gateSummary, paginate, parseLimit, parseOffset, type AppEnv } from '../lib/types.js'

const search = new Hono<AppEnv>()

// ─── Types for raw query rows ─────────────────────────────────────────────────

interface SearchRow {
  id: string
  type: string
  level: string
  jurisdiction: string
  jurisdictionFips: string | null
  title: string
  summary: string | null
  status: string
  topics: string[]
  sourceUrl: string
  introducedDate: Date
  lastActionDate: Date
  createdAt: Date
  rank: number
}

interface CountRow {
  count: bigint
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/search?q=<query>
 *
 * Full-text search over CivicDocument title and fullText using Postgres
 * tsvector / tsquery. Results are ranked by ts_rank and paginated.
 *
 * Optional level/type filters apply on top of the FTS match.
 *
 * @example
 * GET /api/search?q=school+budget&level=school_board&limit=20&offset=0
 */
search.get('/', async c => {
  const q = c.req.query('q')?.trim()

  if (!q || q.length < 2) {
    return c.json({ error: 'q must be at least 2 characters' }, 400)
  }

  const user = c.get('user')
  const limit = parseLimit(c.req.query('limit'))
  const offset = parseOffset(c.req.query('offset'))

  // Optional extra filters (applied as SQL WHERE clauses)
  const levelFilter = c.req.query('level')
  const typeFilter = c.req.query('type')

  const levelClause = levelFilter
    ? Prisma.sql`AND level::text = ${levelFilter}`
    : Prisma.empty
  const typeClause = typeFilter
    ? Prisma.sql`AND type::text = ${typeFilter}`
    : Prisma.empty

  try {
    // Use plainto_tsquery so multi-word queries work without operators
    const [rows, countRows] = await Promise.all([
      db.$queryRaw<SearchRow[]>`
        SELECT
          id,
          type::text,
          level::text,
          jurisdiction,
          "jurisdictionFips",
          title,
          summary,
          status::text,
          topics,
          "sourceUrl",
          "introducedDate",
          "lastActionDate",
          "createdAt",
          ts_rank(
            to_tsvector('english', title || ' ' || COALESCE("fullText", '')),
            plainto_tsquery('english', ${q})
          ) AS rank
        FROM "CivicDocument"
        WHERE
          to_tsvector('english', title || ' ' || COALESCE("fullText", ''))
          @@ plainto_tsquery('english', ${q})
          ${levelClause}
          ${typeClause}
        ORDER BY rank DESC, "lastActionDate" DESC
        LIMIT ${limit}::int
        OFFSET ${offset}::int
      `,

      db.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS count
        FROM "CivicDocument"
        WHERE
          to_tsvector('english', title || ' ' || COALESCE("fullText", ''))
          @@ plainto_tsquery('english', ${q})
          ${levelClause}
          ${typeClause}
      `,
    ])

    const total = Number(countRows[0]?.count ?? 0)
    const data = rows.map(row => gateSummary(row, user))

    return c.json(paginate(data, total, limit, offset))
  } catch (err) {
    console.error('[GET /api/search]', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default search
