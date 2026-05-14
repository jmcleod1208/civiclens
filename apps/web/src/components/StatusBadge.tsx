const STATUS_STYLES: Record<string, string> = {
  introduced:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_committee: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  passed:       'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  signed:       'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  failed:       'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  vetoed:       'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

const STATUS_LABELS: Record<string, string> = {
  introduced:   'Introduced',
  in_committee: 'In Committee',
  passed:       'Passed',
  signed:       'Signed',
  failed:       'Failed',
  vetoed:       'Vetoed',
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
