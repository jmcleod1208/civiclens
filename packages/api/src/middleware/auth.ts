import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { db } from '../lib/db.js'
import type { AppEnv } from '../lib/types.js'

/**
 * Reads an `Authorization: Bearer <token>` header, verifies the JWT against
 * JWT_SECRET, and loads the matching User record into `c.var.user`.
 *
 * Never rejects the request — unauthenticated callers simply get `user = null`
 * and will receive responses that omit gated fields (e.g. `summary`).
 *
 * Dev fallback: if JWT_SECRET is not set (local dev only), the raw token
 * value is treated as a plain user ID so you can test with any valid ID.
 */
export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization')

  if (!header?.startsWith('Bearer ')) {
    c.set('user', null)
    return next()
  }

  const token = header.slice(7).trim()
  const secret = process.env.JWT_SECRET ?? ''

  let userId: string | null = null

  if (secret) {
    try {
      const payload = await verify(token, secret)
      userId = (payload.sub as string) ?? null
    } catch {
      // Invalid or expired token — treat as anonymous
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // Dev convenience: bare user ID as token (no secret required)
    userId = token
  }

  if (!userId) {
    c.set('user', null)
    return next()
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true },
    })
    c.set('user', user as AppEnv['Variables']['user'])
  } catch {
    c.set('user', null)
  }

  return next()
})
