'use client'

interface ModeBadgeProps {
  mode: 'build' | 'debug'
}

export default function ModeBadge({ mode }: ModeBadgeProps) {
  const styles = mode === 'build'
    ? 'bg-indigo-900 text-indigo-300'
    : 'bg-orange-900 text-orange-300'

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${styles}`}>
      {mode}
    </span>
  )
}
