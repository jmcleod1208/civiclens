import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { clearToken } from './api'
import { hasActiveAccess, type AuthUser, type JurisdictionResult } from '@civiclens/shared'

// ── Auth store ────────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null
  hasAccess: boolean
  setUser: (user: AuthUser | null) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hasAccess: false,

  setUser(user) {
    set({ user, hasAccess: user ? hasActiveAccess(user) : false })
  },

  async logout() {
    await clearToken()
    await AsyncStorage.removeItem('cl_jurisdiction')
    set({ user: null, hasAccess: false })
  },
}))

// ── Jurisdiction store ────────────────────────────────────────────────────────

const JURISDICTION_KEY = 'cl_jurisdiction'

interface JurisdictionState {
  jurisdiction: JurisdictionResult | null
  loaded: boolean
  setJurisdiction: (j: JurisdictionResult) => Promise<void>
  loadJurisdiction: () => Promise<void>
}

export const useJurisdictionStore = create<JurisdictionState>((set) => ({
  jurisdiction: null,
  loaded: false,

  async setJurisdiction(j) {
    set({ jurisdiction: j })
    await AsyncStorage.setItem(JURISDICTION_KEY, JSON.stringify(j))
  },

  async loadJurisdiction() {
    const raw = await AsyncStorage.getItem(JURISDICTION_KEY)
    if (raw) {
      try { set({ jurisdiction: JSON.parse(raw), loaded: true }) }
      catch { set({ loaded: true }) }
    } else {
      set({ loaded: true })
    }
  },
}))

// ── Following store (local bookmark list) ─────────────────────────────────────

const FOLLOWING_KEY = 'cl_following'

interface FollowingState {
  documentIds: string[]
  politicianIds: string[]
  toggleDocument: (id: string) => Promise<void>
  togglePolitician: (id: string) => Promise<void>
  load: () => Promise<void>
}

export const useFollowingStore = create<FollowingState>((set, get) => ({
  documentIds: [],
  politicianIds: [],

  async load() {
    const raw = await AsyncStorage.getItem(FOLLOWING_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        set({ documentIds: parsed.documentIds ?? [], politicianIds: parsed.politicianIds ?? [] })
      } catch {}
    }
  },

  async toggleDocument(id) {
    const { documentIds } = get()
    const next = documentIds.includes(id)
      ? documentIds.filter(d => d !== id)
      : [...documentIds, id]
    set({ documentIds: next })
    await AsyncStorage.setItem(FOLLOWING_KEY, JSON.stringify({ documentIds: next, politicianIds: get().politicianIds }))
  },

  async togglePolitician(id) {
    const { politicianIds } = get()
    const next = politicianIds.includes(id)
      ? politicianIds.filter(p => p !== id)
      : [...politicianIds, id]
    set({ politicianIds: next })
    await AsyncStorage.setItem(FOLLOWING_KEY, JSON.stringify({ documentIds: get().documentIds, politicianIds: next }))
  },
}))
