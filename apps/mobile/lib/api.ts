import * as SecureStore from 'expo-secure-store'
import type {
  CivicDocument,
  Politician,
  PaginatedResponse,
  AuthUser,
  JurisdictionResult,
  TrendingTopic,
} from '@civiclens/shared'

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const TOKEN_KEY = 'cl_token'

// ── Token helpers ─────────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}
export async function setToken(t: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, t)
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
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

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signup(email: string, password: string) {
  const data = await req<{ token: string; user: AuthUser }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  await setToken(data.token)
  return data
}

export async function login(email: string, password: string) {
  const data = await req<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  await setToken(data.token)
  return data
}

export async function registerPushToken(expoPushToken: string) {
  return req('/api/notifications/register', {
    method: 'POST',
    body: JSON.stringify({ token: expoPushToken }),
  }).catch(() => {}) // Non-fatal
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export async function verifyReceipt(receipt: string, platform: 'ios' | 'android' | 'web') {
  return req<{ isActive: boolean; expiresAt: string | null }>('/api/subscriptions/verify', {
    method: 'POST',
    body: JSON.stringify({ receipt, platform }),
  })
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function fetchDocuments(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString()
  return req<PaginatedResponse<CivicDocument>>(`/api/documents${qs ? `?${qs}` : ''}`)
}

export async function fetchDocument(id: string) {
  return req<CivicDocument>(`/api/documents/${id}`)
}

// ── Politicians ───────────────────────────────────────────────────────────────

export async function fetchPoliticians(params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString()
  return req<PaginatedResponse<Politician>>(`/api/politicians${qs ? `?${qs}` : ''}`)
}

export async function fetchPolitician(id: string) {
  return req<Politician & { documents: { document: CivicDocument; role: string }[] }>(
    `/api/politicians/${id}`,
  )
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function search(q: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams({
    q,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  }).toString()
  return req<PaginatedResponse<CivicDocument>>(`/api/search?${qs}`)
}

// ── Topics ────────────────────────────────────────────────────────────────────

export async function fetchTrendingTopics() {
  return req<TrendingTopic[]>('/api/topics/trending')
}

// ── Jurisdictions ─────────────────────────────────────────────────────────────

export async function lookupJurisdiction(address: string) {
  return req<JurisdictionResult>(
    `/api/jurisdictions/lookup?address=${encodeURIComponent(address)}`,
  )
}

// ── Re-export shared types ────────────────────────────────────────────────────
export type { CivicDocument, Politician, AuthUser, JurisdictionResult, TrendingTopic, PaginatedResponse }
