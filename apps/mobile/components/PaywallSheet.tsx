import {
  View, Text, Modal, TouchableOpacity, ActivityIndicator, Alert
} from 'react-native'
import { useState } from 'react'
import { X, CheckCircle, Lock } from 'lucide-react-native'
import { presentPaywall, restorePurchases } from '../lib/purchases'
import { useAuthStore } from '../lib/store'

const FEATURES = [
  'Plain English summaries for every document',
  'Real-time impact analysis',
  'Unlimited search & filters',
  'Alerts for your jurisdictions',
]

interface Props {
  visible: boolean
  onClose: () => void
  onPurchased?: () => void
}

export function PaywallSheet({ visible, onClose, onPurchased }: Props) {
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const { user } = useAuthStore()

  async function handlePurchase() {
    setLoading(true)
    try {
      const { purchased } = await presentPaywall()
      if (purchased) {
        // Update local user access
        if (user) {
          useAuthStore.getState().setUser({ ...user, subscriptionStatus: 'active' })
        }
        onPurchased?.()
        onClose()
      }
    } catch (e: any) {
      Alert.alert('Purchase failed', e.message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRestore() {
    setRestoring(true)
    try {
      const restored = await restorePurchases()
      if (restored) {
        if (user) useAuthStore.getState().setUser({ ...user, subscriptionStatus: 'active' })
        onPurchased?.()
        onClose()
        Alert.alert('Restored', 'Your subscription has been restored.')
      } else {
        Alert.alert('No subscription found', 'No active subscription was found for your account.')
      }
    } catch {
      Alert.alert('Error', 'Could not restore purchases.')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="pageSheet">
      <View className="flex-1 bg-black/40">
        <View className="mt-auto bg-white rounded-t-3xl pb-10 pt-5 px-6">
          {/* Handle */}
          <View className="w-10 h-1 rounded-full bg-gray-200 self-center mb-5" />

          {/* Close */}
          <TouchableOpacity onPress={onClose} className="absolute top-5 right-5">
            <X size={20} color="#9ca3af" />
          </TouchableOpacity>

          {/* Icon */}
          <View className="w-14 h-14 rounded-2xl bg-teal-500 items-center justify-center self-center mb-4">
            <Lock size={24} color="white" />
          </View>

          <Text className="text-2xl font-bold text-gray-900 text-center mb-1">
            CivicLens Premium
          </Text>
          <Text className="text-sm text-gray-500 text-center mb-6">
            Understand your government in plain language.
          </Text>

          {/* Features */}
          <View className="space-y-3 mb-6">
            {FEATURES.map(f => (
              <View key={f} className="flex-row items-center gap-3">
                <CheckCircle size={16} color="#01696f" />
                <Text className="text-sm text-gray-700 flex-1">{f}</Text>
              </View>
            ))}
          </View>

          {/* Price */}
          <View className="bg-teal-50 rounded-2xl p-4 mb-5">
            <Text className="text-center text-gray-500 text-xs mb-1">Monthly</Text>
            <Text className="text-center text-3xl font-bold text-teal-600">$4.99</Text>
            <Text className="text-center text-gray-400 text-xs mt-1">Cancel anytime</Text>
          </View>

          {/* CTA */}
          <TouchableOpacity
            onPress={handlePurchase}
            disabled={loading}
            className="bg-teal-500 rounded-full py-3.5 items-center mb-3 active:bg-teal-600"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Start Free Trial</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRestore} disabled={restoring} className="py-2 items-center">
            <Text className="text-sm text-gray-400">
              {restoring ? 'Restoring...' : 'Restore purchases'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
