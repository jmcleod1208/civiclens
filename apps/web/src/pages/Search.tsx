import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search as SearchIcon, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { search as apiSearch } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { DocumentCard } from '../components/DocumentCard'
import { SkeletonList } from '../components/SkeletonCard'

const PAGE_SIZE = 12

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const [q, setQ] = useState(initialQ)
  const [level, setLevel] = useState(searchParams.get('level') ?? '')
  const [page, setPage] = useState(0)
  const { hasAccess } = useAuth()

  const debouncedQ = useQuery({
    queryKey: ['search', q, level, page],
    queryFn: () => apiSearch(q, { limit: PAGE_SIZE, offset: page * PAGE_SIZE, ...(level ? { level } : {}) }),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  })

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setPage(0)
      setSearchParams(q ? { q, ...(level ? { level } : {}) } : {})
    },
    [q, level, setSearchParams],
  )

  const totalPages = debouncedQ.data ? Math.ceil(debouncedQ.data.total / PAGE_SIZE) : 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-display text-3xl text-gray-900 dark:text-gray-100 mb-6">Search</h1>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search bills, resolutions, agendas..."
            className="w-full rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-500)] transition"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={level}
          onChange={e => setLevel(e.target.value)}
          className="rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-500)]"
        >
          <option value="">All levels</option>
          {['federal', 'state', 'county', 'city', 'school_board'].map(l => (
            <option key={l} value={l}>{l.replace('_', ' ')}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-xl bg-[var(--color-teal-500)] hover:bg-[var(--color-teal-600)] text-white px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Search
        </button>
      </form>

      {/* Results */}
      {q.trim().length < 2 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <SearchIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Type at least 2 characters to search</p>
        </div>
      )}

      {debouncedQ.isLoading && <SkeletonList count={6} />}

      {debouncedQ.data && debouncedQ.data.data.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-lg mb-1">No results for "{q}"</p>
          <p className="text-sm">Try different keywords or remove filters.</p>
        </div>
      )}

      {debouncedQ.data && debouncedQ.data.data.length > 0 && (
        <>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
            {debouncedQ.data.total.toLocaleString()} results for "{q}"
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {debouncedQ.data.data.map((doc, i) => (
              <DocumentCard key={doc.id} doc={doc} hasAccess={hasAccess} index={i} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-4 py-2 rounded-lg border border-[var(--color-border)] dark:border-[var(--color-border-dark)] text-sm disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Previous</button>
              <span className="text-sm text-gray-500 px-3">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-4 py-2 rounded-lg border border-[var(--color-border)] dark:border-[var(--color-border-dark)] text-sm disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
