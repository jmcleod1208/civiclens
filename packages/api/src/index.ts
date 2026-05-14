import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { auth } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import subscriptionRoutes from './routes/subscriptions.js'
import documents from './routes/documents.js'
import politicians from './routes/politicians.js'
import jurisdictions from './routes/jurisdictions.js'
import search from './routes/search.js'
import topics from './routes/topics.js'
import type { AppEnv } from './lib/types.js'

const app = new Hono<AppEnv>()

// ─── Global middleware ────────────────────────────────────────────────────────

app.use('*', logger())

app.use(
  '*',
  cors({
    origin: (origin) => {
      // In production, set ALLOWED_ORIGINS="https://app.civiclens.com,..."
      const allowed = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim())
      if (!allowed || allowed.includes('*')) return origin ?? '*'
      return allowed.includes(origin) ? origin : ''
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'OPTIONS'],
    maxAge: 86_400,
  }),
)

// Auth middleware runs on every request and resolves c.var.user (or null).
// Individual routes check the user themselves — auth never blocks requests.
app.use('*', auth)

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/', c => c.json({ name: 'CivicLens API', status: 'ok' }))
app.get('/health', c => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// ─── Routes ───────────────────────────────────────────────────────────────────

app.route('/api/auth', authRoutes)
app.route('/api/subscriptions', subscriptionRoutes)
app.route('/api/documents', documents)
app.route('/api/politicians', politicians)
app.route('/api/jurisdictions', jurisdictions)
app.route('/api/search', search)
app.route('/api/topics', topics)

// ─── 404 catch-all ────────────────────────────────────────────────────────────

app.notFound(c => c.json({ error: 'Not found' }, 404))

app.onError((err, c) => {
  console.error('[unhandled error]', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
