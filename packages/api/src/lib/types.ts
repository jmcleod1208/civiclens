// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled'
}

/**
 * Returns true when the user is allowed to see the `summary` field.
 * An `active` subscription or an in-progress `trial` both grant access.
 */
export function hasSummaryAccess(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  return user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trial'
}

// ─── Hono app environment ─────────────────────────────────────────────────────

export type AppEnv = {
  Variables: {
    /** Null when the request is unauthenticated or the token is invalid. */
    user: AuthUser | null
    /**
     * Set by requireSubscription middleware.
     * True when the user has an active subscription or an active trial.
     * Undefined on routes that don't use requireSubscription.
     */
    hasAccess: boolean | undefined
  }
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export function paginate<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedResponse<T> {
  return {
    data,
    pagination: { total, limit, offset, hasMore: offset + data.length < total },
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/** Clamps a limit query param to [1, maxLimit]. */
export function parseLimit(raw: string | undefined, maxLimit = 100): number {
  const n = parseInt(raw ?? '20', 10)
  return Math.min(Math.max(isNaN(n) ? 20 : n, 1), maxLimit)
}

/** Ensures offset is a non-negative integer. */
export function parseOffset(raw: string | undefined): number {
  const n = parseInt(raw ?? '0', 10)
  return Math.max(isNaN(n) ? 0 : n, 0)
}

/**
 * Strips the `summary` field from a document when the caller is not
 * entitled to see it. Works in-place and returns the mutated object.
 */
export function gateSummary<T extends { summary?: string | null }>(
  doc: T,
  user: AuthUser | null | undefined,
): Omit<T, 'summary'> & { summary?: unknown } {
  if (!hasSummaryAccess(user)) {
    const { summary: _ignored, ...rest } = doc as any
    return rest
  }
  // Parse JSON summary so clients get an object, not a raw string
  if (typeof doc.summary === 'string') {
    try {
      ;(doc as any).summary = JSON.parse(doc.summary)
    } catch {
      /* leave as string if it isn't valid JSON */
    }
  }
  return doc as any
}
