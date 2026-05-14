import { Hono } from 'hono'
import { db } from '../lib/db.js'
import type { AppEnv } from '../lib/types.js'

const subscriptions = new Hono<AppEnv>()

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'ios' | 'android' | 'web'

interface RevenueCatEntitlement {
  expires_date: string | null
  product_identifier: string
  purchase_date: string
}

interface RevenueCatSubscriber {
  subscriber: {
    entitlements: Record<string, RevenueCatEntitlement>
    subscriptions: Record<string, { expires_date: string | null; unsubscribe_detected_at: string | null }>
    original_app_user_id: string
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REVENUECAT_API = 'https://api.revenuecat.com/v1'
const ENTITLEMENT_ID = 'civic_premium'

/** Maps our platform names to RevenueCat's X-Platform header values. */
const PLATFORM_MAP: Record<Platform, string> = {
  ios: 'ios',
  android: 'android',
  web: 'stripe',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireRevenueCatKey(): string {
  const key = process.env.REVENUECAT_SECRET_KEY
  if (!key) throw new Error('REVENUECAT_SECRET_KEY is not set')
  return key
}

/**
 * Submits a receipt to RevenueCat and returns the full subscriber object.
 * RevenueCat normalises iOS/Android/Stripe receipts into a unified format.
 */
async function submitReceipt(
  userId: string,
  receipt: string,
  platform: Platform,
): Promise<RevenueCatSubscriber> {
  const key = requireRevenueCatKey()
  const res = await fetch(`${REVENUECAT_API}/receipts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Platform': PLATFORM_MAP[platform],
      'X-App-User-Id': userId,
    },
    body: JSON.stringify({ fetch_token: receipt }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`RevenueCat receipt submission failed: HTTP ${res.status} — ${body}`)
  }

  return res.json() as Promise<RevenueCatSubscriber>
}

/**
 * Fetches the current subscriber record from RevenueCat without submitting
 * a new receipt. Useful for re-checking status on app launch.
 */
async function getSubscriber(userId: string): Promise<RevenueCatSubscriber> {
  const key = requireRevenueCatKey()
  const res = await fetch(`${REVENUECAT_API}/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  })

  if (!res.ok) {
    throw new Error(`RevenueCat subscriber lookup failed: HTTP ${res.status}`)
  }

  return res.json() as Promise<RevenueCatSubscriber>
}

/**
 * Extracts the `civic_premium` entitlement from a RevenueCat subscriber and
 * maps it to our DB subscription status.
 */
function parseEntitlement(data: RevenueCatSubscriber): {
  isActive: boolean
  expiresAt: string | null
  status: 'active' | 'expired' | 'cancelled'
} {
  const entitlement = data.subscriber.entitlements[ENTITLEMENT_ID]

  if (!entitlement) {
    return { isActive: false, expiresAt: null, status: 'expired' }
  }

  // expires_date is null for lifetime purchases
  if (!entitlement.expires_date) {
    return { isActive: true, expiresAt: null, status: 'active' }
  }

  const expiresAt = new Date(entitlement.expires_date)
  const isActive = expiresAt > new Date()

  return {
    isActive,
    expiresAt: expiresAt.toISOString(),
    status: isActive ? 'active' : 'expired',
  }
}

// ─── POST /api/subscriptions/verify ──────────────────────────────────────────

/**
 * Validates a purchase receipt with RevenueCat and syncs the user's
 * subscription status in our database.
 *
 * Requires a valid Bearer token (the user must be logged in).
 *
 * @body { receipt: string, platform: "ios" | "android" | "web" }
 */
subscriptions.post('/verify', async c => {
  // ── Auth: must be logged in ─────────────────────────────────────────────────
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  let body: { receipt?: string; platform?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Request body must be JSON' }, 400)
  }

  const { receipt, platform } = body

  if (!receipt || typeof receipt !== 'string') {
    return c.json({ error: 'receipt is required' }, 400)
  }
  if (!platform || !['ios', 'android', 'web'].includes(platform)) {
    return c.json({ error: 'platform must be "ios", "android", or "web"' }, 400)
  }

  try {
    // ── 1. Submit receipt to RevenueCat ─────────────────────────────────────────
    const rcData = await submitReceipt(user.id, receipt, platform as Platform)
    const { isActive, expiresAt, status } = parseEntitlement(rcData)

    // ── 2. Sync DB ──────────────────────────────────────────────────────────────
    await db.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: status,
        revenueCatUserId: rcData.subscriber.original_app_user_id,
      },
    })

    console.log(
      `[subscriptions] User ${user.id}: status=${status} expiresAt=${expiresAt ?? 'never'}`,
    )

    return c.json({ isActive, expiresAt })
  } catch (err) {
    console.error('[POST /api/subscriptions/verify]', err)
    return c.json({ error: 'Failed to verify subscription' }, 500)
  }
})

/**
 * GET /api/subscriptions/status
 *
 * Re-checks the current user's entitlement status directly from RevenueCat
 * (no receipt needed). Useful for checking on app launch after a prior purchase.
 */
subscriptions.get('/status', async c => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401)
  }

  try {
    const rcData = await getSubscriber(user.id)
    const { isActive, expiresAt, status } = parseEntitlement(rcData)

    // Sync DB if status changed
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { subscriptionStatus: true },
    })
    if (dbUser && dbUser.subscriptionStatus !== status) {
      await db.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: status },
      })
    }

    return c.json({ isActive, expiresAt, status })
  } catch (err) {
    console.error('[GET /api/subscriptions/status]', err)
    return c.json({ error: 'Failed to retrieve subscription status' }, 500)
  }
})

export default subscriptions
