import { Hono } from 'hono'
import { db } from '../lib/db.js'
import { gateSummary, paginate, parseLimit, parseOffset, type AppEnv } from '../lib/types.js'

const documents = new Hono<AppEnv>()

// ─── List ─────────────────────────────────────────────────────────────────────

documents.get('/', async c => {
  try {
    const user = c.get('user')
    const limit = parseLimit(c.req.query('limit'))
    const offset = parseOffset(c.req.query('offset'))

    // ── Filters ───────────────────────────────────────────────────────────────
    const levelRaw = c.req.query('level')
    const typeRaw = c.req.query('type')
    const jurisdictionRaw = c.req.query('jurisdiction')
    const statusRaw = c.req.query('status')
    const topicRaw = c.req.query('topic')
    const dateFrom = c.req.query('dateFrom')
    const dateTo = c.req.query('dateTo')

    const where: Record<string, unknown> = {}

    if (levelRaw) where.level = levelRaw
    if (typeRaw) where.type = typeRaw
    if (statusRaw) where.status = statusRaw

    if (jurisdictionRaw) {
      where.jurisdiction = { contains: jurisdictionRaw, mode: 'insensitive' }
    }

    if (topicRaw) {
      // topics is a String[] — check if the array contains the given topic
      where.topics = { has: topicRaw }
    }

    if (dateFrom || dateTo) {
      where.introducedDate = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      }
    }

    const [total, rows] = await Promise.all([
      db.civicDocument.count({ where: where as any }),
      db.civicDocument.findMany({
        where: where as any,
        orderBy: { lastActionDate: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          type: true,
          level: true,
          jurisdiction: true,
          jurisdictionFips: true,
          title: true,
          summary: true,      // gated below
          status: true,
          topics: true,
          sourceUrl: true,
          introducedDate: true,
          lastActionDate: true,
          createdAt: true,
          updatedAt: true,
          // fullText intentionally excluded from list — too large
        },
      }),
    ])

    const data = rows.map(doc => gateSummary(doc, user))
    return c.json(paginate(data, total, limit, offset))
  } catch (err) {
    console.error('[GET /api/documents]', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─── Detail ───────────────────────────────────────────────────────────────────

documents.get('/:id', async c => {
  try {
    const user = c.get('user')
    const { id } = c.req.param()

    const doc = await db.civicDocument.findUnique({
      where: { id },
      include: {
        politicians: {
          include: {
            politician: {
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
              },
            },
          },
        },
      },
    })

    if (!doc) {
      return c.json({ error: 'Document not found' }, 404)
    }

    // Reshape politicians join: DocumentPolitician[] → { role, politician }[]
    const politicians = doc.politicians.map(dp => ({
      role: dp.role,
      ...dp.politician,
    }))

    const { politicians: _join, ...docFields } = doc as any
    const result = gateSummary({ ...docFields, politicians }, user)

    return c.json(result)
  } catch (err) {
    console.error('[GET /api/documents/:id]', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default documents
