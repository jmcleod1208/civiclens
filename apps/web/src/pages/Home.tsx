import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Filter, TrendingUp } from 'lucide-react'
import { DocumentCard } from '../components/DocumentCard'
import { SkeletonList } from '../components/SkeletonCard'
import { fetchDocuments, fetchTrendingTopics } from '../lib/api'
import { useAuth } from '../lib/auth-context'

const LEVELS = ['federal', 'state', 'county', 'city', 'school_board']
const STATUSES = ['introduced', 'in_committee', 'passed', 'signed', 'failed', 'vetoed']
const PAGE_SIZE = 12

export default function Home() {
  const { hasAccess } = useAuth()
  const [level, setLevel] = useState('')
  const [status, setStatus] = useState('')
  const [topic, setTopic] = useState('')
  const [page, setPage] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [level, status, topic])

  const params: Record<string, string | number> = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(level  ? { level }  : {}),
    ...(status ? { status } : {}),
    ...(topic  ? { topic }  : {}),
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['documents', params],
    queryFn: () => fetchDocuments(params),
    staleTime: 60_000,
  })

  const { data: trending } = useQuery({
    queryKey: ['trending-topics'],
    queryFn: fetchTrendingTopics,
    staleTime: 5 * 60_000,
  })

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-start gap-8">

        {/* Sidebar */}
        <aside className="w-full md:w-56 shrink-0 space-y-6">
          {/* Trending topics */}
          {trending && trending.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-4 h-4 text-[var(--color-teal-500)]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Trending</span>
              </div>
              <div className="flex flex-col gap-1">
                {trending.slice(0, 8).map(({ topic: t, count }) => (
                  <button
                    key={t}
                    onClick={() => setTopic(topic === t ? '' : t)}
                    className={`text-left text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center justify-between group ${
                      topic === t
                        ? 'bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/30 text-[var(--color-teal-600)] dark:text-[var(--color-teal-400)]'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="truncate">{t}</span>
                    <span className="text-xs text-gray-400 ml-2 shrink-0">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {/* Page header + filter toggle */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="font-display text-2xl text-gray-900 dark:text-gray-100">Your Feed</h1>
              {data && (
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                  {data.total.toLocaleString()} documents
                </p>
              )}
            </div>
            <button
              onClick={() => setShowFilters(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                showFilters || level || status
                  ? 'bg-[var(--color-teal-500)] border-[var(--color-teal-500)] text-white'
                  : 'border-[var(--color-border)] dark:border-[var(--color-border-dark)] text-gray-600 dark:text-gray-400 hover:border-[var(--color-teal-400)]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
            </button>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-5 flex flex-wrap gap-3"
            >
              <select
                value={level}
                onChange={e => setLevel(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-500)]"
              >
                <option value="">All levels</option>
                {LEVELS.map(l => (
                  <option key={l} value={l}>{l.replace('_', ' ')}</option>
                ))}
              </select>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-500)]"
              >
                <option value="">All statuses</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
              {(level || status || topic) && (
                <button
                  onClick={() => { setLevel(''); setStatus(''); setTopic('') }}
                  className="text-sm text-red-400 hover:text-red-600 transition-colors px-2"
                >
                  Clear all
                </button>
              )}
            </motion.div>
          )}

          {/* Content */}
          {isLoading && <SkeletonList count={PAGE_SIZE} />}
          {isError && (
            <div className="text-center py-20 text-gray-400 dark:text-gray-500">
              <p className="text-lg mb-2">Failed to load documents.</p>
              <p className="text-sm">Make sure the API is running.</p>
            </div>
          )}
          {data && data.data.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">No documents found.</p>
              <p className="text-sm text-gray-400">Try adjusting your filters or run the scrapers to populate data.</p>
            </div>
          )}
          {data && data.data.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.data.map((doc, i) => (
                <DocumentCard key={doc.id} doc={doc} hasAccess={hasAccess} index={i} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg border border-[var(--color-border)] dark:border-[var(--color-border-dark)] text-sm disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400 px-3">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 rounded-lg border border-[var(--color-border)] dark:border-[var(--color-border-dark)] text-sm disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
