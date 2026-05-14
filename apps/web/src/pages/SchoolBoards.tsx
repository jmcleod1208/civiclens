import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { School, Search, Calendar, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchDocuments } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { StatusBadge } from '../components/StatusBadge'
import { SkeletonList } from '../components/SkeletonCard'

export default function SchoolBoards() {
  const [zip, setZip] = useState('')
  const [submitted, setSubmitted] = useState('')
  const { hasAccess } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['school-board-docs', submitted],
    queryFn: () =>
      fetchDocuments({
        level: 'school_board',
        limit: 20,
        ...(submitted ? { jurisdiction: submitted } : {}),
      }),
    staleTime: 60_000,
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(zip.trim())
  }

  // Group by jurisdiction
  const byJurisdiction = data?.data.reduce<Record<string, typeof data.data>>((acc, doc) => {
    acc[doc.jurisdiction] = acc[doc.jurisdiction] ?? []
    acc[doc.jurisdiction].push(doc)
    return acc
  }, {}) ?? {}

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/30 flex items-center justify-center">
            <School className="w-5 h-5 text-[var(--color-teal-500)]" />
          </div>
          <h1 className="font-display text-3xl text-gray-900 dark:text-gray-100">School Boards</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xl">
          Find board meeting agendas, minutes, and key decisions from school districts near you.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={zip}
            onChange={e => setZip(e.target.value)}
            placeholder="ZIP code or district name..."
            className="w-full rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-500)] transition"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-[var(--color-teal-500)] hover:bg-[var(--color-teal-600)] text-white px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Find
        </button>
      </form>

      {/* Results */}
      {isLoading && <SkeletonList count={4} />}

      {!isLoading && data && data.data.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <School className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg mb-2">No school board documents found</p>
          <p className="text-sm">
            {submitted
              ? `No results for "${submitted}". Try a different search.`
              : 'Run the BoardDocs scraper to populate school board meeting data.'}
          </p>
        </div>
      )}

      {!isLoading && Object.entries(byJurisdiction).map(([jurisdiction, docs]) => (
        <div key={jurisdiction} className="mb-8">
          {/* District header */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--color-border)] dark:border-[var(--color-border-dark)]">
            <School className="w-4 h-4 text-[var(--color-teal-500)] shrink-0" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{jurisdiction}</h2>
            <span className="text-xs text-gray-400 ml-auto">{docs.length} documents</span>
          </div>

          {/* Timeline */}
          <div className="relative pl-6 space-y-0">
            {/* Vertical line */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-[var(--color-border)] dark:bg-[var(--color-border-dark)]" />

            {docs.map(doc => (
              <div key={doc.id} className="relative mb-3">
                {/* Dot */}
                <div className={`absolute -left-4 top-3.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[var(--color-surface-dark)] ${doc.type === 'minutes' ? 'bg-[var(--color-teal-500)]' : 'bg-amber-400'}`} />
                <Link
                  to={`/document/${doc.id}`}
                  className="block p-3.5 rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] hover:border-[var(--color-teal-300)] dark:hover:border-[var(--color-teal-700)] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${doc.type === 'minutes' ? 'bg-[var(--color-teal-50)] dark:bg-[var(--color-teal-900)]/30 text-[var(--color-teal-700)] dark:text-[var(--color-teal-300)]' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'}`}>
                      {doc.type === 'minutes' ? <FileText className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                      {doc.type}
                    </span>
                    <StatusBadge status={doc.status} />
                    {doc.introducedDate && (
                      <span className="text-xs text-gray-400 ml-auto">
                        {new Date(doc.introducedDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-900 dark:text-gray-100 font-medium line-clamp-2 leading-snug">
                    {doc.title}
                  </p>
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
