'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useForgeStore } from '@/src/stores/forge-store'
import type { ForgeRun, ForgeRunLog, ForgeRunDiff, ForgeRunDiagnosis, ForgeRunResult } from '@/src/services/forge/db'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card'
import ModeBadge from '@/src/components/forge/mode-badge'
import RunStatusBadge from '@/src/components/forge/run-status-badge'
import LogViewer from '@/src/components/forge/log-viewer'
import PlanApproval from '@/src/components/forge/plan-approval'
import DiffViewer from '@/src/components/forge/diff-viewer'
import DiagnosisPanel from '@/src/components/forge/diagnosis-panel'

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
      {/* Run meta */}
      <div className="flex items-center gap-3 flex-wrap">
        <ModeBadge mode={run.mode as 'build' | 'debug'} />
        <RunStatusBadge status={status} />
        {stage && status === 'awaiting_approval' && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
            {stage === 'plan' ? 'Review Plan' : 'Review Code'}
          </span>
        )}
        <span className="font-mono text-xs text-zinc-500 ml-auto">{run.repoUrl}</span>
      </div>

      {/* Error */}
      {run.error && status === 'failed' && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/40 p-4 font-mono text-sm text-red-300">
          {run.error}
        </div>
      )}

      {/* Debug diagnosis */}
      {run.mode === 'debug' && diagnosis && !showPlanApproval && (
        <DiagnosisPanel
          rootCause={diagnosis.rootCause}
          affectedFiles={diagnosis.affectedFiles}
          fixPlan={diagnosis.fixPlan}
        />
      )}

      {/* Pipeline logs */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">Pipeline Logs</div>
        <LogViewer runId={run.id} initialStatus={run.status} />
      </div>

      {/* Plan approval gate */}
      {showPlanApproval && (
        <PlanApproval runId={run.id} mode={run.mode as 'build' | 'debug'} />
      )}

      {/* Code approval gate */}
      {showCodeApproval && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            {run.mode === 'build' ? 'Generated Files' : 'Proposed Fix'} — Review &amp; Approve
          </div>
          <DiffViewer runId={run.id} />
        </div>
      )}

      {/* Success: MR created */}
      {status === 'complete' && result && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-emerald-300">Merge Request Created</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="font-medium text-zinc-100">{result.title}</p>
            <p className="font-mono text-xs text-zinc-400">Branch: {result.branch}</p>
            <Button asChild size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white border-0">
              <a href={result.mrUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                View Merge Request
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Rejected */}
      {status === 'rejected' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 text-center">
          <p className="text-sm text-zinc-400">
            Run rejected.{' '}
            <Link href="/forge" className="font-medium text-orange-400 hover:text-orange-300">
              Start a new run →
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
