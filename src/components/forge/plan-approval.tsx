'use client'

import { useState } from 'react'
import { useForgeStore } from '@/src/stores/forge-store'

interface PlanApprovalProps {
  runId: string
  mode: 'build' | 'debug'
}

export default function PlanApproval({ runId, mode }: PlanApprovalProps) {
  const planData = useForgeStore((s) => s.planData)
  const triggerAdvance = useForgeStore((s) => s.triggerAdvance)
  const setStatus = useForgeStore((s) => s.setStatus)
  const [advancing, setAdvancing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFullPrd, setShowFullPrd] = useState(false)

  const handleAdvance = () => {
    setAdvancing(true)
    triggerAdvance(runId)
  }

  const handleReject = async () => {
    setRejecting(true)
    setError(null)
    try {
      const res = await fetch(`/api/forge/runs/${runId}/reject`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Rejection failed')
      }
      setStatus('rejected')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed')
      setRejecting(false)
    }
  }

  const busy = advancing || rejecting

  return (
    <div className="border border-amber-800 rounded-lg overflow-hidden">
      <div className="bg-amber-950 px-5 py-3 border-b border-amber-800">
        <h2 className="text-amber-300 font-semibold text-sm">
          {mode === 'build' ? 'Review Plan Before Building' : 'Review Diagnosis Before Fixing'}
        </h2>
        <p className="text-amber-400/70 text-xs mt-1">
          {mode === 'build'
            ? 'Approve this plan to start code generation, or reject to cancel.'
            : 'Approve this diagnosis to start generating the fix, or reject to cancel.'}
        </p>
      </div>

      <div className="p-5 space-y-4">
        {mode === 'build' && (
          <>
            {planData?.prdTitle && (
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Title</span>
                <p className="text-white font-medium mt-1">{planData.prdTitle}</p>
              </div>
            )}
            {planData?.prdSummary && (
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Summary</span>
                <p className="text-gray-300 text-sm mt-1">{planData.prdSummary}</p>
              </div>
            )}
            {planData?.prdFullText && (
              <div>
                <button
                  onClick={() => setShowFullPrd(!showFullPrd)}
                  className="text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors"
                >
                  {showFullPrd ? 'Hide full PRD ▲' : 'Show full PRD ▼'}
                </button>
                {showFullPrd && (
                  <pre className="mt-2 bg-gray-950 border border-gray-800 rounded p-4 text-gray-300 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {planData.prdFullText}
                  </pre>
                )}
              </div>
            )}
          </>
        )}

        {mode === 'debug' && (
          <>
            {planData?.rootCause && (
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Root Cause</span>
                <p className="text-red-300 bg-red-950 border border-red-800 rounded p-3 text-sm mt-1 font-mono">
                  {planData.rootCause}
                </p>
              </div>
            )}
            {planData?.affectedFiles && planData.affectedFiles.length > 0 && (
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Affected Files</span>
                <ul className="mt-1 space-y-1">
                  {planData.affectedFiles.map((f, i) => (
                    <li key={i} className="text-gray-400 text-sm font-mono">{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {planData?.fixPlan && planData.fixPlan.length > 0 && (
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide">Fix Plan</span>
                <ol className="mt-1 space-y-2">
                  {planData.fixPlan.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 mt-0.5 ${
                        step.action === 'create' ? 'bg-green-900 text-green-300' :
                        step.action === 'modify' ? 'bg-blue-900 text-blue-300' :
                        'bg-red-900 text-red-300'
                      }`}>
                        {step.action}
                      </span>
                      <div>
                        <span className="text-gray-300 text-sm font-mono">{step.file}</span>
                        <p className="text-gray-500 text-xs">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded p-3">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleAdvance}
            disabled={busy}
            className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-900 disabled:text-amber-400 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {advancing ? 'Starting code generation...' : mode === 'build' ? 'Approve Plan — Generate Code' : 'Approve Diagnosis — Generate Fix'}
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
    </div>
  )
}
