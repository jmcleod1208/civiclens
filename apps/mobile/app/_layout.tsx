import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import '../global.css'
import { useAuthStore, useJurisdictionStore, useFollowingStore } from '../lib/store'
import { getToken } from '../lib/api'
import { initializePurchases } from '../lib/purchases'
import { registerForPushNotifications } from '../lib/notifications'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000 },
  },
})

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { loadJurisdiction } = useJurisdictionStore()
  const { load: loadFollowing } = useFollowingStore()
  const { setUser } = useAuthStore()

  useEffect(() => {
    async function init() {
      // Restore auth from secure store
      const token = await getToken()
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]))
          if (payload.exp * 1000 > Date.now()) {
            setUser({
              id: payload.sub,
              email: payload.email,
              subscriptionStatus: 'trial',
              trialStartedAt: null,
            })
          }
        } catch {}
      }

      // Load persisted stores
      await Promise.all([loadJurisdiction(), loadFollowing()])

      // Initialize RevenueCat (non-blocking)
      initializePurchases(undefined).catch(() => {})

      // Register for push notifications (non-blocking)
      registerForPushNotifications().catch(() => {})
    }
    init()
  }, [])

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInitializer>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="document/[id]" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="politician/[id]" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
      </AppInitializer>
    </QueryClientProvider>
  )
}
