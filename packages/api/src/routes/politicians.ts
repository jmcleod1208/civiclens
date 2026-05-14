import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { paginate, parseLimit, parseOffset, type AppEnv } from '../lib/types.js'

const politicians = new Hono<AppEnv>()

// ─── List ─────────────────────────────────────────────────────────────────────

politicians.get('/', async c => {
  try {
    const limit = parseLimit(c.req.query('limit'))
    const offset = parseOffset(c.req.query('offset'))

    const levelRaw = c.req.query('level')
    const jurisdictionRaw = c.req.query('jurisdiction')
    const partyRaw = c.req.query('party')

    const where: Record<string, unknown> = {}
    if (levelRaw) where.level = levelRaw
    if (partyRaw) where.party = { equals: partyRaw, mode: 'insensitive' }
    if (jurisdictionRaw) {
      where.jurisdiction = { contains: jurisdictionRaw, mode: 'insensitive' }
    }

    const [total, rows] = await Promise.all([
      db.politician.count({ where: where as any }),
      db.politician.findMany({
        where: where as any,
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          title: true,
          party: true,
          district: true,
          level: true,
          jurisdiction: true,
          photoUrl: true,
          contactEmail: true,
          contactPhone: true,
          contactFormUrl: true,
          bioguideId: true,
          createdAt: true,
          updatedAt: true,
          // sourceIds excluded from list (internal scraper metadata)
        },
      }),
    ])

    return c.json(paginate(rows, total, limit, offset))
  } catch (err) {
    console.error('[GET /api/politicians]', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─── Profile ──────────────────────────────────────────────────────────────────

politicians.get('/:id', async c => {
  try {
    const { id } = c.req.param()

    const politician = await db.politician.findUnique({
      where: { id },
      include: {
        documents: {
          orderBy: { document: { lastActionDate: 'desc' } },
          include: {
            document: {
              select: {
                id: true,
                type: true,
                level: true,
                jurisdiction: true,
                title: true,
                status: true,
                topics: true,
                sourceUrl: true,
                introducedDate: true,
                lastActionDate: true,
              },
            },
          },
        },
      },
    })

    if (!politician) {
      return c.json({ error: 'Politician not found' }, 404)
    }

    // Reshape: DocumentPolitician[] → { role, ...document }[]
    const associatedDocuments = politician.documents.map(dp => ({
      role: dp.role,
      ...dp.document,
    }))

    const { documents: _join, sourceIds: _internal, ...profile } = politician as any
    return c.json({ ...profile, documents: associatedDocuments })
  } catch (err) {
    console.error('[GET /api/politicians/:id]', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default politicians
