'use client'

import { useEffect } from 'react'
import { useForgeStore } from '@/src/stores/forge-store'
import type { ForgeRun, ForgeRunLog, ForgeRunDiff, ForgeRunDiagnosis, ForgeRunResult } from '@/src/services/forge/db'
import ModeBadge from '@/src/components/forge/mode-badge'
import RunStatusBadge from '@/src/components/forge/run-status-badge'
import LogViewer from '@/src/components/forge/log-viewer'
import PlanApproval from '@/src/components/forge/plan-approval'
import DiffViewer from '@/src/components/forge/diff-viewer'
import DiagnosisPanel from '@/src/components/forge/diagnosis-panel'
import Link from 'next/link'

interface RunDetailViewProps {
  run: ForgeRun
  initialLogs: ForgeRunLog[]
  initialDiff: ForgeRunDiff | null
  initialDiagnosis: ForgeRunDiagnosis | null
  initialResult: ForgeRunResult | null
}

export default function RunDetailView({
  run,
  initialLogs,
  initialDiff,
  initialDiagnosis,
  initialResult,
}: RunDetailViewProps) {
  const status = useForgeStore((s) => s.status)
  const stage = useForgeStore((s) => s.stage)
  const diff = useForgeStore((s) => s.diff)
  const diagnosis = useForgeStore((s) => s.diagnosis)
  const result = useForgeStore((s) => s.result)
  const hydrateRun = useForgeStore((s) => s.hydrateRun)

  // Initialize store from server data
  useEffect(() => {
    hydrateRun({
      status: run.status,
      stage: run.stage ?? null,
      logs: initialLogs.map((log) => ({
        step: log.step,
        level: log.level as 'info' | 'warn' | 'error' | 'success',
        message: log.message,
      })),
      diff: initialDiff
        ? {
            files: initialDiff.files as Array<{ path: string; content: string }>,
            lintPassed: initialDiff.lintPassed,
            testsPassed: initialDiff.testsPassed,
            errors: initialDiff.errors as string[],
          }
        : null,
      diagnosis: initialDiagnosis
        ? {
            rootCause: initialDiagnosis.rootCause,
            affectedFiles: initialDiagnosis.affectedFiles as string[],
            fixPlan: initialDiagnosis.fixPlan as Array<{ file: string; action: 'create' | 'modify' | 'delete'; description: string }>,
          }
        : null,
      result: initialResult
        ? {
            mrUrl: initialResult.mrUrl,
            mrIid: initialResult.mrIid,
            branch: initialResult.branch,
            title: initialResult.title,
          }
        : null,
      planData: run.mode === 'build'
        ? {
            prdTitle: run.prdTitle ?? undefined,
            prdSummary: run.prdSummary ?? undefined,
          }
        : initialDiagnosis
          ? {
              rootCause: initialDiagnosis.rootCause,
              affectedFiles: initialDiagnosis.affectedFiles as string[],
              fixPlan: initialDiagnosis.fixPlan as Array<{ file: string; action: 'create' | 'modify' | 'delete'; description: string }>,
            }
          : null,
    })
  }, [hydrateRun, initialDiagnosis, initialDiff, initialLogs, initialResult, run.mode, run.prdSummary, run.prdTitle, run.stage, run.status])

  const showPlanApproval = status === 'awaiting_approval' && stage === 'plan'
  const showCodeApproval = status === 'awaiting_approval' && stage === 'code' && diff

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ModeBadge mode={run.mode as 'build' | 'debug'} />
            <RunStatusBadge status={status} />
            {stage && status === 'awaiting_approval' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-900 text-amber-300">
                {stage === 'plan' ? 'Review Plan' : 'Review Code'}
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold text-white">
            {run.prdTitle || `Run ${run.id.slice(0, 8)}`}
          </h1>
          <p className="text-gray-400 text-sm mt-1 font-mono">{run.repoUrl}</p>
        </div>
        <Link href="/forge/runs" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          ← History
        </Link>
      </div>

      {run.error && status === 'failed' && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-red-300 text-sm font-mono">
          {run.error}
        </div>
      )}

      {run.mode === 'debug' && diagnosis && !showPlanApproval && (
        <DiagnosisPanel
          rootCause={diagnosis.rootCause}
          affectedFiles={diagnosis.affectedFiles}
          fixPlan={diagnosis.fixPlan}
        />
      )}

      <div>
        <h2 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Pipeline Logs</h2>
        <LogViewer runId={run.id} initialStatus={run.status} />
      </div>

      {showPlanApproval && (
        <PlanApproval runId={run.id} mode={run.mode as 'build' | 'debug'} />
      )}

      {showCodeApproval && (
        <div>
          <h2 className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
            {run.mode === 'build' ? 'Generated Files' : 'Proposed Fix'} — Review & Approve
          </h2>
          <DiffViewer runId={run.id} />
        </div>
      )}

      {status === 'complete' && result && (
        <div className="border border-green-800 rounded-lg p-5">
          <h2 className="text-green-300 font-semibold text-sm mb-3">Merge Request Created</h2>
          <p className="text-white font-medium mb-1">{result.title}</p>
          <p className="text-gray-400 text-sm font-mono mb-3">Branch: {result.branch}</p>
          <a
            href={result.mrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            View Merge Request →
          </a>
        </div>
      )}

      {status === 'rejected' && (
        <div className="border border-gray-700 rounded-lg p-5 text-center">
          <p className="text-gray-400">
            Run rejected.{' '}
            <Link href="/forge" className="text-indigo-400 hover:text-indigo-300">Start a new run →</Link>
          </p>
        </div>
      )}
    </div>
  )
}
