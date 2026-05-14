// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

// ── Domain models ─────────────────────────────────────────────────────────────

export type DocumentType =
  | 'bill' | 'resolution' | 'motion' | 'ordinance'
  | 'minutes' | 'agenda' | 'amendment'

export type DocumentLevel =
  | 'federal' | 'state' | 'county' | 'city'
  | 'school_board' | 'special_district'

export type DocumentStatus =
  | 'introduced' | 'in_committee' | 'passed'
  | 'failed' | 'signed' | 'vetoed'

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'cancelled'

export interface DocumentSummary {
  what_it_proposes: string
  who_it_affects: string
  what_it_means_for_you: string
}

export interface Politician {
  id: string
  name: string
  title?: string | null
  party?: string | null
  district?: string | null
  level: string
  jurisdiction: string
  photoUrl?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  contactFormUrl?: string | null
  bioguideId?: string | null
}

export interface DocumentPolitician {
  politician: Politician
  role: string
}

export interface CivicDocument {
  id: string
  type: DocumentType
  level: DocumentLevel
  jurisdiction: string
  title: string
  fullText?: string | null
  summary?: DocumentSummary | null
  status: DocumentStatus
  introducedDate?: string | null
  lastActionDate?: string | null
  topics: string[]
  sourceUrl?: string | null
  jurisdictionFips?: string | null
  createdAt: string
  updatedAt: string
  politicians?: DocumentPolitician[]
}

export interface AuthUser {
  id: string
  email: string
  subscriptionStatus: SubscriptionStatus
  trialStartedAt: string | null
}

export interface JurisdictionResult {
  address: string
  federal_district?: string
  state?: string
  state_fips?: string
  state_upper_district?: string
  state_lower_district?: string
  county?: string
  county_fips?: string
  city?: string
  school_district?: string
}

export interface TrendingTopic {
  topic: string
  count: number
}

export interface Notification {
  id: string
  type: 'new_document' | 'status_change' | 'upcoming_meeting'
  read: boolean
  createdAt: string
  document?: Pick<CivicDocument, 'id' | 'title' | 'status' | 'level' | 'jurisdiction'>
}

// ── Utility ───────────────────────────────────────────────────────────────────

export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export function hasActiveAccess(user: Pick<AuthUser, 'subscriptionStatus' | 'trialStartedAt'>): boolean {
  if (user.subscriptionStatus === 'active') return true
  if (user.subscriptionStatus === 'trial' && user.trialStartedAt) {
    return Date.now() - new Date(user.trialStartedAt).getTime() < TRIAL_DURATION_MS
  }
  return false
}

export function trialDaysLeft(trialStartedAt: string | null): number {
  if (!trialStartedAt) return 0
  const elapsed = Date.now() - new Date(trialStartedAt).getTime()
  return Math.max(0, Math.ceil((TRIAL_DURATION_MS - elapsed) / (24 * 60 * 60 * 1000)))
}

export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: string }
