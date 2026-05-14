import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, AlertCircle, Crown, LogOut, ArrowRight } from 'lucide-react'
import { useAuth } from '../lib/auth-context'

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function TrialCountdown({ trialStartedAt }: { trialStartedAt: string }) {
  const elapsed = Date.now() - new Date(trialStartedAt).getTime()
  const remaining = Math.max(0, TRIAL_DURATION_MS - elapsed)
  const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000))
  const pct = Math.min(100, (elapsed / TRIAL_DURATION_MS) * 100)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-400">Trial progress</span>
        <span className={`font-medium ${daysLeft <= 1 ? 'text-red-500' : 'text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)]'}`}>
          {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
        </span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full ${pct > 85 ? 'bg-red-400' : 'bg-[var(--color-teal-500)]'}`}
        />
      </div>
    </div>
  )
}

export default function Account() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/onboarding')
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-gray-400 mb-4">You're not signed in.</p>
        <Link
          to="/onboarding"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-teal-500)] text-white px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-teal-600)] transition-colors"
        >
          Sign in <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  const isActive   = user.subscriptionStatus === 'active'
  const isTrial    = user.subscriptionStatus === 'trial'
  const isExpired  = user.subscriptionStatus === 'expired' || user.subscriptionStatus === 'cancelled'
  const trialActive = isTrial && user.trialStartedAt
    ? Date.now() - new Date(user.trialStartedAt).getTime() < TRIAL_DURATION_MS
    : false

  const statusConfig = isActive
    ? { icon: <CheckCircle className="w-5 h-5 text-green-500" />, label: 'Active subscription', color: 'text-green-600 dark:text-green-400' }
    : trialActive
    ? { icon: <Clock className="w-5 h-5 text-[var(--color-teal-500)]" />, label: 'Free trial', color: 'text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)]' }
    : { icon: <AlertCircle className="w-5 h-5 text-red-400" />, label: 'No active subscription', color: 'text-red-500' }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-3xl text-gray-900 dark:text-gray-100 mb-8">Account</h1>

      {/* Profile card */}
      <div className="bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] rounded-2xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] p-6 mb-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-[var(--color-teal-100)] dark:bg-[var(--color-teal-900)] flex items-center justify-center text-lg font-bold text-[var(--color-teal-700)] dark:text-[var(--color-teal-300)]">
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{user.email}</p>
            <div className={`flex items-center gap-1.5 text-sm mt-0.5 ${statusConfig.color}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </div>
          </div>
        </div>

        {/* Trial countdown */}
        {isTrial && user.trialStartedAt && trialActive && (
          <TrialCountdown trialStartedAt={user.trialStartedAt} />
        )}
      </div>

      {/* Subscription CTA */}
      {!isActive && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-br from-[var(--color-teal-600)] to-[var(--color-teal-800)] p-6 text-white mb-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-5 h-5 text-yellow-300" />
            <span className="font-semibold text-lg">CivicLens Premium</span>
          </div>
          <ul className="space-y-1.5 text-sm text-teal-100 mb-5">
            {[
              'Plain English summaries for every document',
              'Real-time impact analysis',
              'Unlimited searches & filters',
              'Email alerts for your jurisdictions',
            ].map(f => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-300 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold">$4.99</span>
              <span className="text-teal-200 text-sm"> / month</span>
            </div>
            <button className="rounded-full bg-white text-[var(--color-teal-700)] font-semibold px-5 py-2 text-sm hover:bg-teal-50 transition-colors">
              Subscribe
            </button>
          </div>
          {isExpired && (
            <p className="text-xs text-teal-200 mt-3">
              Your trial has ended. Subscribe to continue accessing summaries.
            </p>
          )}
        </motion.div>
      )}

      {/* Jurisdiction info */}
      {(() => {
        const stored = localStorage.getItem('cl_jurisdiction')
        if (!stored) return null
        try {
          const j = JSON.parse(stored)
          return (
            <div className="bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] rounded-2xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] p-6 mb-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Your jurisdictions</h2>
              <div className="space-y-2">
                {[
                  ['Federal', j.federal_district],
                  ['State', j.state],
                  ['County', j.county],
                  ['City', j.city],
                  ['School District', j.school_district],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className="text-gray-400">{label}</span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <Link
                to="/onboarding"
                className="text-xs text-[var(--color-teal-500)] hover:underline mt-3 inline-block"
              >
                Update address
              </Link>
            </div>
          )
        } catch {
          return null
        }
      })()}

      {/* Sign out */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-2 text-sm text-red-400 hover:text-red-600 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  )
}
