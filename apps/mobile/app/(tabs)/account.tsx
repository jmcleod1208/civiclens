import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import {
  User, Crown, CheckCircle, Clock, AlertCircle, LogOut, ChevronRight, MapPin
} from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'
import { useAuthStore, useJurisdictionStore } from '../../lib/store'
import { PaywallSheet } from '../../components/PaywallSheet'
import { trialDaysLeft } from '@civiclens/shared'
import { restorePurchases } from '../../lib/purchases'

export default function AccountScreen() {
  const router = useRouter()
  const { user, logout, hasAccess } = useAuthStore()
  const { jurisdiction } = useJurisdictionStore()
  const [showPaywall, setShowPaywall] = useState(false)

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8" edges={['top']}>
        <User size={48} color="#d1d5db" />
        <Text className="text-gray-400 text-base mt-3 mb-1">Not signed in</Text>
        <TouchableOpacity
          onPress={() => router.push('/onboarding')}
          className="mt-4 bg-teal-500 rounded-full px-6 py-2.5 active:bg-teal-600"
        >
          <Text className="text-white font-semibold text-sm">Sign in</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const isTrial = user.subscriptionStatus === 'trial'
  const isActive = user.subscriptionStatus === 'active'
  const isExpired = !isActive && !hasAccess
  const daysLeft = isTrial ? trialDaysLeft(user.trialStartedAt) : 0

  async function handleLogout() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await logout()
          router.replace('/onboarding')
        }
      },
    ])
  }

  async function handleRestore() {
    const ok = await restorePurchases()
    if (ok) {
      useAuthStore.getState().setUser({ ...user, subscriptionStatus: 'active' })
      Alert.alert('Restored', 'Your subscription has been restored.')
    } else {
      Alert.alert('Nothing to restore', 'No active subscription found.')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="px-4 pt-3 pb-2">
          <Text className="text-2xl font-bold text-gray-900">Account</Text>
        </View>

        {/* Profile card */}
        <View className="mx-4 bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-12 h-12 rounded-full bg-teal-100 items-center justify-center">
              <Text className="text-lg font-bold text-teal-700">{user.email.charAt(0).toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>{user.email}</Text>
              <View className="flex-row items-center gap-1.5 mt-0.5">
                {isActive ? (
                  <><CheckCircle size={13} color="#16a34a" /><Text className="text-xs text-green-600">Active subscription</Text></>
                ) : hasAccess ? (
                  <><Clock size={13} color="#01696f" /><Text className="text-xs text-teal-600">Trial — {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</Text></>
                ) : (
                  <><AlertCircle size={13} color="#ef4444" /><Text className="text-xs text-red-500">No active subscription</Text></>
                )}
              </View>
            </View>
          </View>

          {/* Trial progress bar */}
          {isTrial && hasAccess && (
            <View className="mt-1">
              <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <View
                  className={`h-full rounded-full ${daysLeft <= 1 ? 'bg-red-400' : 'bg-teal-500'}`}
                  style={{ width: `${Math.min(100, ((7 - daysLeft) / 7) * 100)}%` }}
                />
              </View>
            </View>
          )}
        </View>

        {/* Upgrade CTA */}
        {!isActive && (
          <TouchableOpacity
            onPress={() => setShowPaywall(true)}
            className="mx-4 bg-teal-500 rounded-2xl p-4 mb-4 flex-row items-center gap-3 active:bg-teal-600"
          >
            <Crown size={22} color="#fde68a" />
            <View className="flex-1">
              <Text className="text-white font-semibold">Upgrade to Premium</Text>
              <Text className="text-teal-100 text-xs mt-0.5">
                {isExpired ? 'Your trial has ended.' : 'Unlock summaries for every document.'}
                {' '}$4.99/mo
              </Text>
            </View>
            <ChevronRight size={18} color="white" />
          </TouchableOpacity>
        )}

        {/* Jurisdiction */}
        {jurisdiction && (
          <View className="mx-4 bg-white rounded-2xl border border-gray-100 p-4 mb-4">
            <View className="flex-row items-center gap-2 mb-3">
              <MapPin size={15} color="#01696f" />
              <Text className="text-sm font-semibold text-gray-900">Your jurisdictions</Text>
            </View>
            {[
              ['Federal', jurisdiction.federal_district],
              ['State', jurisdiction.state],
              ['County', jurisdiction.county],
              ['City', jurisdiction.city],
              ['School District', jurisdiction.school_district],
            ].filter(([, v]) => v).map(([label, value]) => (
              <View key={label as string} className="flex-row justify-between py-1.5 border-b border-gray-50">
                <Text className="text-xs text-gray-400">{label}</Text>
                <Text className="text-xs font-medium text-gray-700">{value}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => router.push('/onboarding')} className="mt-2">
              <Text className="text-xs text-teal-500">Update address →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu items */}
        <View className="mx-4 bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
          {isActive && (
            <TouchableOpacity className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-50 active:bg-gray-50">
              <Text className="text-sm text-gray-700">Manage subscription</Text>
              <ChevronRight size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleRestore}
            className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-50 active:bg-gray-50"
          >
            <Text className="text-sm text-gray-700">Restore purchases</Text>
            <ChevronRight size={16} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            className="flex-row items-center gap-2 px-4 py-3.5 active:bg-gray-50"
          >
            <LogOut size={16} color="#ef4444" />
            <Text className="text-sm text-red-500">Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchased={() => setShowPaywall(false)}
      />
    </SafeAreaView>
  )
}
