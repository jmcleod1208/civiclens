import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ExternalLink, ArrowLeft, Users, FileText, Lightbulb, Globe } from 'lucide-react'
import { fetchDocument } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { StatusBadge } from '../components/StatusBadge'
import { PaywallCard } from '../components/PaywallCard'

type Tab = 'plain' | 'full' | 'politicians' | 'impact'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'plain',      label: 'Plain English', icon: <Lightbulb className="w-4 h-4" /> },
  { id: 'full',       label: 'Full Document', icon: <FileText className="w-4 h-4" /> },
  { id: 'politicians',label: 'Politicians',   icon: <Users className="w-4 h-4" /> },
  { id: 'impact',     label: 'Impact',        icon: <Globe className="w-4 h-4" /> },
]

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const { hasAccess } = useAuth()
  const [tab, setTab] = useState<Tab>('plain')

  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['document', id],
    queryFn: () => fetchDocument(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-8 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    )
  }

  if (isError || !doc) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center text-gray-400">
        Document not found.
      </div>
    )
  }

  const summary = doc.summary as Record<string, string> | null | undefined

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to feed
      </Link>

      {/* Two-panel layout */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        {/* Left — main content */}
        <div>
          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <StatusBadge status={doc.status} />
            <span className="text-xs text-gray-400 capitalize">{doc.level.replace('_', ' ')} · {doc.jurisdiction}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl text-gray-900 dark:text-gray-100 leading-snug mb-4">
            {doc.title}
          </h1>

          {/* Topics */}
          {doc.topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {doc.topics.map(t => (
                <span key={t} className="rounded-full bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/30 text-[var(--color-teal-700)] dark:text-[var(--color-teal-300)] text-xs px-3 py-1">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border)] dark:border-[var(--color-border-dark)] mb-6 -mx-1 overflow-x-auto">
            {TABS.map(({ id: tid, label, icon }) => (
              <button
                key={tid}
                onClick={() => setTab(tid)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === tid
                    ? 'border-[var(--color-teal-500)] text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            {/* Plain English tab */}
            {tab === 'plain' && (
              <div>
                {hasAccess && summary ? (
                  <div className="space-y-6">
                    {[
                      { key: 'what_it_proposes',   label: 'What it proposes' },
                      { key: 'who_it_affects',      label: 'Who it affects' },
                      { key: 'what_it_means_for_you', label: 'What it means for you' },
                    ].map(({ key, label }) =>
                      summary[key] ? (
                        <div key={key}>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)] mb-2">{label}</h3>
                          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{summary[key]}</p>
                        </div>
                      ) : null
                    )}
                  </div>
                ) : !hasAccess ? (
                  <PaywallCard preview={summary?.what_it_proposes} />
                ) : (
                  <p className="text-gray-400 dark:text-gray-500 italic">
                    Summary not yet generated. The summarization job will process this document shortly.
                  </p>
                )}
              </div>
            )}

            {/* Full Document tab */}
            {tab === 'full' && (
              <div>
                {doc.fullText ? (
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-body">
                    {doc.fullText}
                  </pre>
                ) : doc.sourceUrl ? (
                  <div className="text-center py-10">
                    <p className="text-gray-400 mb-4">Full text not yet extracted.</p>
                    <a
                      href={doc.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-[var(--color-teal-500)] hover:underline text-sm"
                    >
                      View source document <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No full text available.</p>
                )}
              </div>
            )}

            {/* Politicians tab */}
            {tab === 'politicians' && (
              <div>
                {doc.politicians && doc.politicians.length > 0 ? (
                  <div className="space-y-3">
                    {doc.politicians.map(({ politician: p, role }) => (
                      <Link
                        key={p.id}
                        to={`/politician/${p.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] hover:border-[var(--color-teal-300)] dark:hover:border-[var(--color-teal-700)] transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-[var(--color-teal-100)] dark:bg-[var(--color-teal-900)] flex items-center justify-center text-sm font-semibold text-[var(--color-teal-700)] dark:text-[var(--color-teal-300)] overflow-hidden shrink-0">
                          {p.photoUrl ? (
                            <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : p.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 truncate">{p.title ?? ''} {p.party ? `· ${p.party}` : ''}</p>
                        </div>
                        <span className="text-xs text-gray-400 capitalize shrink-0">{role.replace('_', ' ')}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No politicians linked to this document.</p>
                )}
              </div>
            )}

            {/* Impact tab */}
            {tab === 'impact' && (
              <div>
                {hasAccess && summary ? (
                  <div className="rounded-xl bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/20 p-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)] mb-3">What this means for you</h3>
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      {summary.what_it_means_for_you ?? 'Impact analysis not yet available.'}
                    </p>
                  </div>
                ) : !hasAccess ? (
                  <PaywallCard />
                ) : (
                  <p className="text-gray-400 italic">Impact analysis not yet available.</p>
                )}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Details</h3>
            {[
              ['Type',         doc.type?.replace('_', ' ')],
              ['Level',        doc.level?.replace('_', ' ')],
              ['Jurisdiction', doc.jurisdiction],
              ['Introduced',   doc.introducedDate ? new Date(doc.introducedDate).toLocaleDateString() : null],
              ['Last action',  doc.lastActionDate ? new Date(doc.lastActionDate).toLocaleDateString() : null],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 capitalize">{value}</p>
              </div>
            ))}
            {doc.sourceUrl && (
              <a
                href={doc.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-teal-500)] hover:underline mt-2"
              >
                Source <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
