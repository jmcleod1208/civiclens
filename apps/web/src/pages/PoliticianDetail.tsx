import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Mail, Phone, ExternalLink } from 'lucide-react'
import { fetchPolitician } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { StatusBadge } from '../components/StatusBadge'

export default function PoliticianDetail() {
  const { id } = useParams<{ id: string }>()
  const { hasAccess } = useAuth()

  const { data: politician, isLoading, isError } = useQuery({
    queryKey: ['politician', id],
    queryFn: () => fetchPolitician(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 animate-pulse space-y-4">
        <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="flex gap-4 items-center">
          <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !politician) {
    return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-gray-400">Politician not found.</div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      {/* Profile header */}
      <div className="bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] rounded-2xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
          <div className="w-20 h-20 rounded-full bg-[var(--color-teal-100)] dark:bg-[var(--color-teal-900)] flex items-center justify-center text-2xl font-bold text-[var(--color-teal-700)] dark:text-[var(--color-teal-300)] overflow-hidden shrink-0">
            {politician.photoUrl ? (
              <img src={politician.photoUrl} alt={politician.name} className="w-full h-full object-cover" />
            ) : politician.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl text-gray-900 dark:text-gray-100">{politician.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
              {[politician.title, politician.party, politician.district].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs text-gray-400 mt-1 capitalize">
              {politician.level?.replace('_', ' ')} · {politician.jurisdiction}
            </p>
          </div>
        </div>

        {/* Contact buttons */}
        <div className="flex flex-wrap gap-2 mt-5">
          {politician.contactEmail && (
            <a
              href={`mailto:${politician.contactEmail}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] dark:border-[var(--color-border-dark)] px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:border-[var(--color-teal-400)] hover:text-[var(--color-teal-600)] transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
          )}
          {politician.contactPhone && (
            <a
              href={`tel:${politician.contactPhone}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] dark:border-[var(--color-border-dark)] px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:border-[var(--color-teal-400)] hover:text-[var(--color-teal-600)] transition-colors"
            >
              <Phone className="w-3.5 h-3.5" /> {politician.contactPhone}
            </a>
          )}
          {politician.contactFormUrl && (
            <a
              href={politician.contactFormUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] dark:border-[var(--color-border-dark)] px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:border-[var(--color-teal-400)] hover:text-[var(--color-teal-600)] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Contact form
            </a>
          )}
        </div>
      </div>

      {/* Document history */}
      <h2 className="font-display text-xl text-gray-900 dark:text-gray-100 mb-4">Document History</h2>
      {politician.documents && politician.documents.length > 0 ? (
        <div className="space-y-3">
          {politician.documents.map(({ document: doc, role }) => (
            <Link
              key={doc.id}
              to={`/document/${doc.id}`}
              className="flex items-start gap-4 p-4 rounded-xl border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] hover:border-[var(--color-teal-300)] dark:hover:border-[var(--color-teal-700)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <StatusBadge status={doc.status} />
                  <span className="text-xs text-gray-400 capitalize">{role.replace('_', ' ')}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
                  {doc.title}
                </p>
                {doc.introducedDate && (
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(doc.introducedDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-gray-400 dark:text-gray-500 italic text-sm">No documents linked yet.</p>
      )}
    </div>
  )
}
