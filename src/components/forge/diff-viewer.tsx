'use client'

import { useMemo, useState } from 'react'
import { useForgeStore } from '@/src/stores/forge-store'

interface DiffViewerProps {
  runId: string
}

export default function DiffViewer({ runId }: DiffViewerProps) {
  const diff = useForgeStore((s) => s.diff)
  const logs = useForgeStore((s) => s.logs)
  const setResult = useForgeStore((s) => s.setResult)
  const setStatus = useForgeStore((s) => s.setStatus)

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(diff?.files[0] ? [diff.files[0].path] : [])
  )
  const [expandedCycles, setExpandedCycles] = useState<Set<number>>(new Set([1]))
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  if (!diff) return null

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const handleApprove = async () => {
    setApproving(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/forge/runs/${runId}/approve`, { method: 'POST' })
      const data = await res.json() as { mrUrl?: string; mrIid?: number; branch?: string; title?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Approval failed')
      setResult({ mrUrl: data.mrUrl!, mrIid: data.mrIid!, branch: data.branch!, title: data.title! })
      setStatus('complete')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approval failed')
      setApproving(false)
    }
  }

  const handleReject = async () => {
    setRejecting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/forge/runs/${runId}/reject`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Rejection failed')
      }
      setStatus('rejected')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rejection failed')
      setRejecting(false)
    }
  }

  const busy = approving || rejecting
  const hasVerificationErrors = diff.errors.length > 0
  const autoFixSummary = useMemo(() => {
    const autoFixLogs = logs.filter((log) => log.step === 'AutoFix')
    if (autoFixLogs.length === 0) return null

    const cycles = new Map<number, {
      cycle: number
      repairedFiles: string[]
      rootCause: string | null
      status: string | null
      outcome: 'success' | 'warning' | 'error'
    }>()

    for (const log of autoFixLogs) {
      const cycleMatch = log.message.match(/Auto-fix cycle (\d+)\/(\d+)/i)
      const repairMatch = log.message.match(/Repairing\s+(.+?)\s+\((?:create|modify)\)/i)
      const rootCauseMatch = log.message.match(/Root cause \((?:high|medium|low)\):\s*(.+)$/i)
      const appliedMatch = log.message.match(/Applied \d+ targeted repair/i)
      const failedMatch = log.message.match(/Auto-fix limit reached|could not produce an actionable repair plan/i)

      let cycleNumber = cycleMatch ? Number(cycleMatch[1]) : null
      if (!cycleNumber && repairMatch) {
        cycleNumber = Math.max(...Array.from(cycles.keys()), 1)
      }
      if (!cycleNumber && (rootCauseMatch || appliedMatch || failedMatch)) {
        cycleNumber = Math.max(...Array.from(cycles.keys()), 1)
      }
      if (!cycleNumber) continue

      const existing = cycles.get(cycleNumber) ?? {
        cycle: cycleNumber,
        repairedFiles: [],
        rootCause: null,
        status: null,
        outcome: 'warning' as const,
      }

      if (repairMatch) {
        const filePath = repairMatch[1].trim()
        if (!existing.repairedFiles.includes(filePath)) {
          existing.repairedFiles.push(filePath)
        }
      }

      if (rootCauseMatch) {
        existing.rootCause = rootCauseMatch[1].trim()
      }

      if (appliedMatch || failedMatch) {
        existing.status = log.message
        existing.outcome = failedMatch ? 'error' : 'success'
      } else if (repairMatch || rootCauseMatch) {
        existing.outcome = existing.outcome === 'error' ? 'error' : 'warning'
      }

      cycles.set(cycleNumber, existing)
    }

    const cycleEntries = Array.from(cycles.values()).sort((left, right) => left.cycle - right.cycle)
    const cycleCount = cycleEntries.length
    const repairedFiles = Array.from(new Set(cycleEntries.flatMap((cycle) => cycle.repairedFiles)))
    const rootCauses = Array.from(new Set(cycleEntries.map((cycle) => cycle.rootCause).filter((value): value is string => Boolean(value))))

    const finalStatus = [...autoFixLogs].reverse().find((log) =>
      /Applied \d+ targeted repair|Auto-fix limit reached|could not produce an actionable repair plan/i.test(log.message)
    )?.message ?? null

    return {
      cycleCount,
      repairedFiles,
      rootCauses,
      finalStatus,
      cycles: cycleEntries,
    }
  }, [logs])

  const toggleCycle = (cycle: number) => {
    setExpandedCycles((prev) => {
      const next = new Set(prev)
      next.has(cycle) ? next.delete(cycle) : next.add(cycle)
      return next
    })
  }

  const cycleTone = (outcome: 'success' | 'warning' | 'error') => {
    if (outcome === 'success') {
      return {
        border: 'border-emerald-800/60',
        header: 'bg-emerald-950/35 hover:bg-emerald-900/25',
        title: 'text-emerald-200',
        accent: 'text-emerald-400',
        body: 'bg-emerald-950/15 text-emerald-100',
        mono: 'text-emerald-300/90',
        badge: 'bg-emerald-900/50 text-emerald-200',
        label: 'Recovered',
      }
    }
    if (outcome === 'error') {
      return {
        border: 'border-red-800/60',
        header: 'bg-red-950/35 hover:bg-red-900/25',
        title: 'text-red-200',
        accent: 'text-red-400',
        body: 'bg-red-950/15 text-red-100',
        mono: 'text-red-300/90',
        badge: 'bg-red-900/50 text-red-200',
        label: 'Needs Review',
      }
    }
    return {
      border: 'border-amber-800/50',
      header: 'bg-amber-950/40 hover:bg-amber-900/30',
      title: 'text-amber-200',
      accent: 'text-amber-400',
      body: 'bg-amber-950/20 text-amber-100',
      mono: 'text-amber-300/90',
      badge: 'bg-amber-900/50 text-amber-200',
      label: 'In Progress',
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${diff.lintPassed ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          Lint {diff.lintPassed ? '✓' : '✗'}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${diff.testsPassed ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          Tests {diff.testsPassed ? '✓' : '✗'}
        </span>
        <span className="text-gray-500 text-xs">{diff.files.length} file{diff.files.length !== 1 ? 's' : ''}</span>
      </div>

      {autoFixSummary && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-amber-200">Auto-Fix Summary</h3>
            <span className="text-[11px] uppercase tracking-wide text-amber-400">
              {autoFixSummary.cycleCount > 0 ? `${autoFixSummary.cycleCount} cycle${autoFixSummary.cycleCount === 1 ? '' : 's'}` : 'Triggered'}
            </span>
          </div>
          {autoFixSummary.rootCauses.length > 0 && (
            <div className="text-sm text-amber-100">
              <span className="font-medium text-amber-300">Root cause:</span>{' '}
              {autoFixSummary.rootCauses.join(' | ')}
            </div>
          )}
          {autoFixSummary.repairedFiles.length > 0 && (
            <div className="text-sm text-amber-100">
              <span className="font-medium text-amber-300">Repaired files:</span>{' '}
              {autoFixSummary.repairedFiles.join(', ')}
            </div>
          )}
          {autoFixSummary.finalStatus && (
            <div className="text-xs text-amber-300/90 font-mono">
              {autoFixSummary.finalStatus}
            </div>
          )}
          {autoFixSummary.cycles.length > 0 && (
            <div className="space-y-2 pt-1">
              {autoFixSummary.cycles.map((cycle) => (
                <div key={cycle.cycle} className={`rounded border overflow-hidden ${cycleTone(cycle.outcome).border}`}>
                  <button
                    onClick={() => toggleCycle(cycle.cycle)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${cycleTone(cycle.outcome).header}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${cycleTone(cycle.outcome).title}`}>
                        Cycle {cycle.cycle}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${cycleTone(cycle.outcome).badge}`}>
                        {cycleTone(cycle.outcome).label}
                      </span>
                    </div>
                    <span className={`text-xs ${cycleTone(cycle.outcome).accent}`}>
                      {expandedCycles.has(cycle.cycle) ? 'Hide Details' : 'Show Details'}
                    </span>
                  </button>
                  {expandedCycles.has(cycle.cycle) && (
                    <div className={`space-y-2 px-3 py-3 text-sm ${cycleTone(cycle.outcome).body}`}>
                      {cycle.rootCause && (
                        <div>
                          <span className={`font-medium ${cycleTone(cycle.outcome).accent}`}>Root cause:</span>{' '}
                          {cycle.rootCause}
                        </div>
                      )}
                      <div>
                        <span className={`font-medium ${cycleTone(cycle.outcome).accent}`}>Files touched:</span>{' '}
                        {cycle.repairedFiles.length > 0 ? cycle.repairedFiles.join(', ') : 'No file rewrites recorded'}
                      </div>
                      {cycle.status && (
                        <div className={`font-mono text-xs ${cycleTone(cycle.outcome).mono}`}>
                          {cycle.status}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {diff.errors.length > 0 && (
        <div className="bg-red-950 border border-red-800 rounded p-3 text-red-300 text-xs font-mono">
          {diff.errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <div className="space-y-2">
        {diff.files.map(file => (
          <div key={file.path} className="border border-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleFile(file.path)}
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-900 hover:bg-gray-800 text-left transition-colors"
            >
              <span className="text-gray-300 text-sm font-mono">{file.path}</span>
              <span className="text-gray-600 text-xs">{expandedFiles.has(file.path) ? '▲' : '▼'}</span>
            </button>
            {expandedFiles.has(file.path) && (
              <pre className="bg-gray-950 text-green-300 text-xs p-4 overflow-x-auto max-h-96 overflow-y-auto font-mono leading-relaxed">
                {file.content}
              </pre>
            )}
          </div>
        ))}
      </div>

      {actionError && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded p-3">{actionError}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={busy || hasVerificationErrors}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 disabled:text-indigo-400 text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          {approving ? 'Pushing MR...' : hasVerificationErrors ? 'Resolve Verification Errors First' : 'Approve & Push MR'}
        </button>
        <button
          onClick={handleReject}
          disabled={busy}
          className="px-6 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-medium py-2.5 rounded-lg transition-colors"
        >
          {rejecting ? 'Rejecting...' : 'Reject'}
        </button>
      </div>
    </div>
  )
}
