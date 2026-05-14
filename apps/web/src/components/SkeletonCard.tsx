export function SkeletonCard() {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] dark:border-[var(--color-border-dark)] bg-[var(--color-card)] dark:bg-[var(--color-card-dark)] p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-5 w-24 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="h-5 w-3/4 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
      <div className="h-4 w-full rounded bg-gray-100 dark:bg-gray-800 mb-1" />
      <div className="h-4 w-5/6 rounded bg-gray-100 dark:bg-gray-800 mb-4" />
      <div className="flex gap-2 mb-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-6 w-16 rounded-full bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
      <div className="flex gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
    </div>
  )
}

export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
