const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export function getToken(): string | null {
  return localStorage.getItem('cl_token')
}
export function setToken(t: string) {
  localStorage.setItem('cl_token', t)
}
export function clearToken() {
  localStorage.removeItem('cl_token')
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw Object.assign(new Error(err.error ?? 'Request failed'), { status: res.status })
  }
  return res.json()
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Document {
  id: string
  type: string
  level: string
  jurisdiction: string
  title: string
  fullText?: string
  summary?: Record<string, string> | null
  status: string
  introducedDate?: string
  lastActionDate?: string
  topics: string[]
  sourceUrl?: string
  jurisdictionFips?: string
  politicians?: { politician: Politician; role: string }[]
}

export interface Politician {
  id: string
  name: string
  title?: string
  party?: string
  district?: string
  level: string
  jurisdiction: string
  photoUrl?: string
  contactEmail?: string
  contactPhone?: string
  contactFormUrl?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

export interface AuthUser {
  id: string
  email: string
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'cancelled'
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

// ── Auth ───────────────────────────────────────────────────────────────────

export async function signup(email: string, password: string) {
  const data = await req<{ token: string; user: AuthUser }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.token)
  return data
}

export async function login(email: string, password: string) {
  const data = await req<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(data.token)
  return data
}

// ── Documents ──────────────────────────────────────────────────────────────

export async function fetchDocuments(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString()
  return req<PaginatedResponse<Document>>(`/api/documents${qs ? `?${qs}` : ''}`)
}

export async function fetchDocument(id: string) {
  return req<Document>(`/api/documents/${id}`)
}

// ── Politicians ────────────────────────────────────────────────────────────

export async function fetchPoliticians(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString()
  return req<PaginatedResponse<Politician>>(`/api/politicians${qs ? `?${qs}` : ''}`)
}

export async function fetchPolitician(id: string) {
  return req<Politician & { documents: { document: Document; role: string }[] }>(
    `/api/politicians/${id}`,
  )
}

// ── Jurisdictions ──────────────────────────────────────────────────────────

export async function lookupJurisdiction(address: string) {
  return req<JurisdictionResult>(
    `/api/jurisdictions/lookup?address=${encodeURIComponent(address)}`,
  )
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function search(q: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams({
    q,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString()
  return req<PaginatedResponse<Document>>(`/api/search?${qs}`)
}

// ── Topics ─────────────────────────────────────────────────────────────────

export async function fetchTrendingTopics() {
  return req<{ topic: string; count: number }[]>('/api/topics/trending')
}
