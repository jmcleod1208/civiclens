import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert
} from 'react-native'
import { useRouter } from 'expo-router'
import { MapPin, ArrowRight, Eye, EyeOff, CheckCircle } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { signup, login, lookupJurisdiction } from '../lib/api'
import { useAuthStore, useJurisdictionStore } from '../lib/store'
import { initializePurchases } from '../lib/purchases'
import { registerForPushNotifications } from '../lib/notifications'
import type { JurisdictionResult } from '../lib/api'

type Step = 'auth' | 'address' | 'done'

export default function OnboardingScreen() {
  const router = useRouter()
  const { setUser } = useAuthStore()
  const { setJurisdiction } = useJurisdictionStore()

  const [step, setStep] = useState<Step>('auth')
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [address, setAddress] = useState('')
  const [jurisdiction, setJurisdictionData] = useState<JurisdictionResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleAuth() {
    if (!email.trim() || password.length < 8) {
      Alert.alert('Error', 'Enter a valid email and password (min 8 chars).')
      return
    }
    setLoading(true)
    try {
      const fn = authMode === 'signup' ? signup : login
      const { user } = await fn(email.trim(), password)
      setUser(user)
      // Initialize RevenueCat with the user ID
      initializePurchases(user.id).catch(() => {})
      registerForPushNotifications().catch(() => {})
      setStep('address')
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddress() {
    if (!address.trim()) return
    setLoading(true)
    try {
      const result = await lookupJurisdiction(address.trim())
      setJurisdictionData(result)
      await setJurisdiction(result)
      setStep('done')
    } catch {
      Alert.alert('Not found', 'Could not find jurisdictions for that address. Try being more specific.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View className="items-center pt-12 pb-10">
            <Text className="text-4xl font-bold text-teal-600">CivicLens</Text>
            <Text className="text-gray-400 text-sm mt-1">Government made legible.</Text>
          </View>

          {/* Step: Auth */}
          {step === 'auth' && (
            <View className="bg-white rounded-3xl p-6 shadow-sm">
              <Text className="text-xl font-bold text-gray-900 mb-1">
                {authMode === 'signup' ? 'Create account' : 'Welcome back'}
              </Text>
              <Text className="text-sm text-gray-400 mb-5">
                {authMode === 'signup' ? '7-day free trial, no credit card.' : 'Sign in to continue.'}
              </Text>

              <Text className="text-xs font-medium text-gray-600 mb-1.5">Email</Text>
              <TextInput
                className="bg-gray-50 border border-gray-100 rounded-xl px-4 h-11 text-sm text-gray-900 mb-3"
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />

              <Text className="text-xs font-medium text-gray-600 mb-1.5">Password</Text>
              <View className="flex-row items-center bg-gray-50 border border-gray-100 rounded-xl px-4 h-11 mb-5">
                <TextInput
                  className="flex-1 text-sm text-gray-900"
                  placeholder="Min 8 characters"
                  placeholderTextColor="#9ca3af"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(s => !s)}>
                  {showPassword ? <EyeOff size={16} color="#9ca3af" /> : <Eye size={16} color="#9ca3af" />}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleAuth}
                disabled={loading}
                className="bg-teal-500 rounded-full py-3.5 items-center active:bg-teal-600 mb-4"
              >
                {loading
                  ? <ActivityIndicator color="white" />
                  : <Text className="text-white font-semibold text-base">
                      {authMode === 'signup' ? 'Create account' : 'Sign in'}
                    </Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setAuthMode(m => m === 'signup' ? 'login' : 'signup')}
                className="items-center"
              >
                <Text className="text-sm text-gray-400">
                  {authMode === 'signup' ? 'Already have an account? ' : "Don't have one? "}
                  <Text className="text-teal-600 font-medium">
                    {authMode === 'signup' ? 'Sign in' : 'Sign up'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step: Address */}
          {step === 'address' && (
            <View className="bg-white rounded-3xl p-6 shadow-sm">
              <View className="w-12 h-12 rounded-2xl bg-teal-50 items-center justify-center mb-4">
                <MapPin size={24} color="#01696f" />
              </View>
              <Text className="text-xl font-bold text-gray-900 mb-1">Your address</Text>
              <Text className="text-sm text-gray-400 mb-5">
                We'll find your representatives and local documents.
              </Text>

              <TextInput
                className="bg-gray-50 border border-gray-100 rounded-xl px-4 h-11 text-sm text-gray-900 mb-4"
                placeholder="123 Main St, Salt Lake City, UT 84101"
                placeholderTextColor="#9ca3af"
                value={address}
                onChangeText={setAddress}
                autoCapitalize="words"
              />

              <TouchableOpacity
                onPress={handleAddress}
                disabled={loading}
                className="bg-teal-500 rounded-full py-3.5 flex-row items-center justify-center gap-2 active:bg-teal-600 mb-3"
              >
                {loading
                  ? <ActivityIndicator color="white" />
                  : <>
                      <Text className="text-white font-semibold text-base">Find my jurisdictions</Text>
                      <ArrowRight size={18} color="white" />
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/(tabs)')}
                className="items-center py-2"
              >
                <Text className="text-sm text-gray-400">Skip for now</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step: Done */}
          {step === 'done' && jurisdiction && (
            <View className="bg-white rounded-3xl p-6 shadow-sm items-center">
              <Text className="text-4xl mb-3">🎉</Text>
              <Text className="text-xl font-bold text-gray-900 mb-1 text-center">You're all set!</Text>
              <Text className="text-sm text-gray-400 mb-5 text-center">Your civic jurisdictions:</Text>

              <View className="w-full space-y-2 mb-6">
                {[
                  ['Federal', jurisdiction.federal_district],
                  ['State', jurisdiction.state],
                  ['County', jurisdiction.county],
                  ['City', jurisdiction.city],
                  ['School District', jurisdiction.school_district],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <View key={label as string} className="flex-row items-center gap-2 bg-teal-50 rounded-xl px-4 py-2.5">
                    <CheckCircle size={14} color="#01696f" />
                    <Text className="text-xs text-gray-400 w-24">{label}</Text>
                    <Text className="text-xs font-medium text-gray-900 flex-1">{value}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => router.replace('/(tabs)')}
                className="w-full bg-teal-500 rounded-full py-3.5 flex-row items-center justify-center gap-2 active:bg-teal-600"
              >
                <Text className="text-white font-semibold text-base">Go to my feed</Text>
                <ArrowRight size={18} color="white" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
