import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { db } from '../lib/db.js'
import type { AppEnv } from '../lib/types.js'

/** How long the trial period lasts. */
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function isTrialActive(trialStartedAt: Date | null): boolean {
  if (!trialStartedAt) return false
  return Date.now() - trialStartedAt.getTime() < TRIAL_DURATION_MS
}

/**
 * Hard authentication + subscription middleware.
 *
 * Unlike the soft `auth` middleware (which passes through anonymous requests),
 * this middleware REJECTS requests that have no valid Bearer token with 401.
 *
 * On success it sets two context variables:
 *   - `c.var.user`      — the authenticated AuthUser
 *   - `c.var.hasAccess` — true when the user is in an active trial (≤7 days)
 *                         OR has an active subscription
 *
 * Routes apply this middleware when they need to know definitively whether
 * the caller is entitled to premium content.
 *
 * @example
 * // Protect an entire sub-app:
 * app.use('/api/premium/*', requireSubscription)
 *
 * // Or use per-route:
 * app.get('/api/documents/:id/export', requireSubscription, handler)
 */
export const requireSubscription = createMiddleware<AppEnv>(async (c, next) => {
  // ── 1. Extract token ──────────────────────────────────────────────────────────
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  const token = header.slice(7).trim()
  const secret = process.env.JWT_SECRET ?? ''

  if (!secret) {
    console.error('[requireSubscription] JWT_SECRET is not set')
    return c.json({ error: 'Server misconfiguration' }, 500)
  }

  // ── 2. Verify JWT ─────────────────────────────────────────────────────────────
  let userId: string
  try {
    const payload = await verify(token, secret)
    userId = payload.sub as string
    if (!userId) throw new Error('Missing sub claim')
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  // ── 3. Load user ─────────────────────────────────────────────────────────────
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, subscriptionStatus: true, trialStartedAt: true },
  })

  if (!user) {
    return c.json({ error: 'User not found' }, 401)
  }

  // ── 4. Determine access ───────────────────────────────────────────────────────
  const hasAccess =
    user.subscriptionStatus === 'active' ||
    (user.subscriptionStatus === 'trial' && isTrialActive(user.trialStartedAt))

  // ── 5. Attach to context ──────────────────────────────────────────────────────
  c.set('user', { id: user.id, subscriptionStatus: user.subscriptionStatus as any })
  c.set('hasAccess', hasAccess)

  return next()
})
