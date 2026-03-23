'use client'

interface RunStatusBadgeProps {
  status: string
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-800 text-gray-300',
  running: 'bg-blue-900 text-blue-300 animate-pulse',
  awaiting_approval: 'bg-amber-900 text-amber-300',
  publishing: 'bg-blue-900 text-blue-300 animate-pulse',
  complete: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
  rejected: 'bg-gray-800 text-gray-500',
}

export default function RunStatusBadge({ status }: RunStatusBadgeProps) {
  const styles = STATUS_STYLES[status] || STATUS_STYLES.pending
  const label = status.replace(/_/g, ' ')

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles}`}>
      {label}
    </span>
  )
}
