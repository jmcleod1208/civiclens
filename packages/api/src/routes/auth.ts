import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { db } from '../lib/db.js'
import { getSupabaseAdmin } from '../lib/supabase.js'
import type { AppEnv } from '../lib/types.js'

const auth = new Hono<AppEnv>()

// ─── Constants ────────────────────────────────────────────────────────────────

/** Tokens are valid for 30 days. */
const JWT_EXPIRY_SECS = 30 * 24 * 60 * 60

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireJwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is not set')
  return s
}

async function issueToken(userId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    { sub: userId, email, iat: now, exp: now + JWT_EXPIRY_SECS },
    requireJwtSecret(),
  )
}

function userPayload(user: {
  id: string
  email: string
  subscriptionStatus: string
  trialStartedAt: Date | null
}) {
  return {
    id: user.id,
    email: user.email,
    subscriptionStatus: user.subscriptionStatus,
    trialStartedAt: user.trialStartedAt?.toISOString() ?? null,
  }
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

/**
 * Creates a Supabase auth user and a parallel User record in our database.
 * The new user starts a 7-day trial immediately (trialStartedAt = now).
 * Returns a signed JWT for use as a Bearer token on subsequent requests.
 *
 * @body { email: string, password: string }
 */
auth.post('/signup', async c => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Request body must be JSON' }, 400)
  }

  const { email, password } = body
  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'password must be at least 8 characters' }, 400)
  }

  try {
    const supabase = getSupabaseAdmin()

    // ── 1. Create Supabase user ────────────────────────────────────────────────
    const { data: sbData, error: sbError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email confirmation for now
    })

    if (sbError) {
      // Surface clean messages for common cases
      if (sbError.message.toLowerCase().includes('already registered')) {
        return c.json({ error: 'An account with this email already exists' }, 409)
      }
      return c.json({ error: sbError.message }, 400)
    }

    // ── 2. Create DB user ──────────────────────────────────────────────────────
    let user
    try {
      user = await db.user.create({
        data: {
          email,
          trialStartedAt: new Date(),
          subscriptionStatus: 'trial',
        },
        select: { id: true, email: true, subscriptionStatus: true, trialStartedAt: true },
      })
    } catch (dbErr: any) {
      // Email already exists in our DB (race or prior signup) — clean up Supabase user
      if (dbErr?.code === 'P2002') {
        await supabase.auth.admin.deleteUser(sbData.user!.id).catch(() => {})
        return c.json({ error: 'An account with this email already exists' }, 409)
      }
      throw dbErr
    }

    // ── 3. Issue JWT ────────────────────────────────────────────────────────────
    const token = await issueToken(user.id, user.email)

    return c.json({ token, user: userPayload(user) }, 201)
  } catch (err) {
    console.error('[POST /api/auth/signup]', err)
    return c.json({ error: 'Signup failed' }, 500)
  }
})

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

/**
 * Validates credentials against Supabase, looks up the DB user record,
 * and returns a fresh JWT along with the user's current subscription status.
 *
 * @body { email: string, password: string }
 */
auth.post('/login', async c => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Request body must be JSON' }, 400)
  }

  const { email, password } = body
  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }

  try {
    const supabase = getSupabaseAdmin()

    // ── 1. Validate credentials with Supabase ──────────────────────────────────
    const { error: sbError } = await supabase.auth.signInWithPassword({ email, password })
    if (sbError) {
      // Always return the same message to prevent email enumeration
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    // ── 2. Load DB user ────────────────────────────────────────────────────────
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, subscriptionStatus: true, trialStartedAt: true },
    })

    if (!user) {
      // Supabase user exists but our DB record is missing — unusual; guard it
      return c.json({ error: 'Account setup incomplete. Please contact support.' }, 404)
    }

    // ── 3. Issue JWT ────────────────────────────────────────────────────────────
    const token = await issueToken(user.id, user.email)

    return c.json({ token, user: userPayload(user) })
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    return c.json({ error: 'Login failed' }, 500)
  }
})

export default auth
