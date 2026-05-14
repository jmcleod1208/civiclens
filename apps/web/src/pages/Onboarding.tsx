import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../lib/auth-context'
import { lookupJurisdiction, signup, login, type JurisdictionResult } from '../lib/api'

type Step = 'auth' | 'address' | 'done'

export default function Onboarding() {
  const { setUser } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('auth')
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [address, setAddress] = useState('')
  const [jurisdiction, setJurisdiction] = useState<JurisdictionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fn = authMode === 'signup' ? signup : login
      const { user } = await fn(email, password)
      setUser(user)
      setStep('address')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddress(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await lookupJurisdiction(address)
      setJurisdiction(result)
      localStorage.setItem('cl_jurisdiction', JSON.stringify(result))
      setStep('done')
    } catch (err: any) {
      setError('Could not find jurisdiction for that address. Try a more specific address.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] flex items-center justify-center px-4">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -24 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)] mb-2">
            CivicLens
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Government made legible.
          </p>
        </div>

        <div className="bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] rounded-2xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] p-8 shadow-sm">

          {/* Step 1 — Auth */}
          {step === 'auth' && (
            <>
              <h2 className="font-display text-2xl text-gray-900 dark:text-gray-100 mb-1">
                {authMode === 'signup' ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {authMode === 'signup'
                  ? '7-day free trial, no credit card required.'
                  : 'Sign in to continue.'}
              </p>
              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-500)] transition"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-500)] transition pr-10"
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-full bg-[var(--color-teal-500)] hover:bg-[var(--color-teal-600)] disabled:opacity-50 text-white font-medium py-2.5 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {authMode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              </form>
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-5">
                {authMode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => { setAuthMode(m => m === 'signup' ? 'login' : 'signup'); setError('') }}
                  className="text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)] font-medium hover:underline"
                >
                  {authMode === 'signup' ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </>
          )}

          {/* Step 2 — Address */}
          {step === 'address' && (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/30 mb-4">
                <MapPin className="w-6 h-6 text-[var(--color-teal-500)]" />
              </div>
              <h2 className="font-display text-2xl text-gray-900 dark:text-gray-100 mb-1">
                Your address
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                We'll find your representatives and show you documents that affect your community.
              </p>
              <form onSubmit={handleAddress} className="space-y-4">
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-500)] transition"
                  placeholder="123 Main St, Salt Lake City, UT 84101"
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-full bg-[var(--color-teal-500)] hover:bg-[var(--color-teal-600)] disabled:opacity-50 text-white font-medium py-2.5 transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Find my jurisdictions
                </button>
              </form>
              <button
                onClick={() => navigate('/')}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-4 transition-colors"
              >
                Skip for now
              </button>
            </>
          )}

          {/* Step 3 — Done */}
          {step === 'done' && jurisdiction && (
            <>
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">🎉</div>
                <h2 className="font-display text-2xl text-gray-900 dark:text-gray-100 mb-2">You're all set!</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">We found your civic jurisdictions:</p>
              </div>
              <div className="space-y-2 mb-6">
                {[
                  ['Federal District', jurisdiction.federal_district],
                  ['State', jurisdiction.state],
                  ['County', jurisdiction.county],
                  ['City', jurisdiction.city],
                  ['School District', jurisdiction.school_district],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-xl bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/20 px-4 py-2.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/')}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-[var(--color-teal-500)] hover:bg-[var(--color-teal-600)] text-white font-medium py-2.5 transition-colors"
              >
                Go to my feed <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
