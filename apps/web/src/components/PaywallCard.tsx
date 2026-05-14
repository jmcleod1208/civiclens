import { Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Props {
  preview?: string
}

export function PaywallCard({ preview }: Props) {
  const blurLines = preview
    ? [preview.slice(0, 80), preview.slice(80, 160) || 'Continue reading to see the full summary...']
    : [
        'This legislation would significantly affect residents in the jurisdiction...',
        'Key provisions include funding allocations and regulatory changes that...',
      ]

  return (
    <div className="relative rounded-xl overflow-hidden border border-[var(--color-border)] dark:border-[var(--color-border-dark)]">
      {/* Blurred teaser lines */}
      <div className="p-4 space-y-2">
        {blurLines.map((line, i) => (
          <p key={i} className="paywall-blur text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {line}
          </p>
        ))}
      </div>

      {/* Frosted glass overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-black/60 backdrop-blur-sm p-5 text-center">
        <div className="bg-[var(--color-teal-500)] rounded-full p-2.5 mb-3">
          <Lock className="w-5 h-5 text-white" />
        </div>
        <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Plain English Summary
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Start your 7-day free trial to unlock summaries for every document.
        </p>
        <Link
          to="/account"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-teal-500)] hover:bg-[var(--color-teal-600)] text-white text-sm font-medium px-5 py-2 transition-colors"
        >
          Unlock for $4.99 / mo
        </Link>
      </div>
    </div>
  )
}
