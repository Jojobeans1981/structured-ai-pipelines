'use client'

import { useState } from 'react'
import { useForgeStore } from '@/src/stores/forge-store'

interface DiffViewerProps {
  runId: string
}

export default function DiffViewer({ runId }: DiffViewerProps) {
  const diff = useForgeStore((s) => s.diff)
  const setResult = useForgeStore((s) => s.setResult)
  const setStatus = useForgeStore((s) => s.setStatus)

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(diff?.files[0] ? [diff.files[0].path] : [])
  )
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
          disabled={busy}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 disabled:text-indigo-400 text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          {approving ? 'Pushing MR...' : 'Approve & Push MR'}
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
