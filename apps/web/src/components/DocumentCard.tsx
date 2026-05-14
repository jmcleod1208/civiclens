import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { MapPin, ChevronRight } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { PaywallCard } from './PaywallCard'
import type { Document, Politician } from '../lib/api'

const LEVEL_LABELS: Record<string, string> = {
  federal:         'Federal',
  state:           'State',
  county:          'County',
  city:            'City',
  school_board:    'School Board',
  special_district:'Special District',
}

interface AvatarRowProps {
  politicians: { politician: Politician; role: string }[]
}

function AvatarRow({ politicians }: AvatarRowProps) {
  const visible = politicians.slice(0, 3)
  const overflow = politicians.length - 3

  return (
    <div className="flex items-center gap-1.5">
      {visible.map(({ politician }) => (
        <div
          key={politician.id}
          title={politician.name}
          className="w-7 h-7 rounded-full bg-[var(--color-teal-100)] dark:bg-[var(--color-teal-900)] flex items-center justify-center text-xs font-semibold text-[var(--color-teal-700)] dark:text-[var(--color-teal-300)] ring-2 ring-white dark:ring-[var(--color-card-dark)] overflow-hidden"
        >
          {politician.photoUrl ? (
            <img src={politician.photoUrl} alt={politician.name} className="w-full h-full object-cover" />
          ) : (
            politician.name.charAt(0)
          )}
        </div>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-0.5">+{overflow} more</span>
      )}
    </div>
  )
}

interface Props {
  doc: Document
  hasAccess: boolean
  index?: number
}

export function DocumentCard({ doc, hasAccess, index = 0 }: Props) {
  const summaryText =
    doc.summary && typeof doc.summary === 'object'
      ? (doc.summary as any).what_it_proposes ?? ''
      : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="group rounded-[var(--radius-card)] border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] p-5 flex flex-col gap-3 hover:shadow-md hover:border-[var(--color-teal-300)] dark:hover:border-[var(--color-teal-700)] transition-all duration-200"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={doc.status} />
        <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
          <MapPin className="w-3 h-3" />
          {LEVEL_LABELS[doc.level] ?? doc.level} · {doc.jurisdiction}
        </span>
      </div>

      {/* Title */}
      <Link
        to={`/document/${doc.id}`}
        className="font-display text-gray-900 dark:text-gray-100 leading-snug hover:text-[var(--color-teal-600)] dark:hover:text-[var(--color-teal-400)] transition-colors line-clamp-2"
      >
        {doc.title}
      </Link>

      {/* Topics */}
      {doc.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {doc.topics.slice(0, 4).map(topic => (
            <span
              key={topic}
              className="rounded-full bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/30 text-[var(--color-teal-700)] dark:text-[var(--color-teal-300)] text-xs px-2.5 py-0.5"
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      {/* Plain English preview */}
      {hasAccess && summaryText ? (
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
          {summaryText}
        </p>
      ) : !hasAccess && summaryText ? (
        <PaywallCard preview={summaryText} />
      ) : !hasAccess && !summaryText ? (
        <PaywallCard />
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--color-border)] dark:border-[var(--color-border-dark)]">
        {doc.politicians && doc.politicians.length > 0 ? (
          <AvatarRow politicians={doc.politicians} />
        ) : (
          <span />
        )}
        <Link
          to={`/document/${doc.id}`}
          className="text-[var(--color-teal-500)] hover:text-[var(--color-teal-700)] transition-colors"
          aria-label="View document"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </motion.div>
  )
}
