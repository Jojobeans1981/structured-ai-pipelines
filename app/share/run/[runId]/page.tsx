import { notFound } from 'next/navigation'
import { prisma } from '@/src/lib/prisma'
import { BuildSummary } from '@/src/services/build-summary'
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card'
import { CheckCircle2, AlertTriangle, ShieldCheck, Clock3, Coins, FileText, GitBranch, Rocket } from 'lucide-react'

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export default async function SharedRunPage({
  params,
}: {
  params: { runId: string }
}) {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    select: { id: true, status: true, project: { select: { name: true } } },
  })

  if (!run || run.status !== 'completed') {
    notFound()
  }

  const summary = await BuildSummary.generate(params.runId)
  const passCount = summary.verification.filter((check) => check.status === 'pass').length
  const warnCount = summary.verification.filter((check) => check.status === 'warn').length
  const failCount = summary.verification.filter((check) => check.status === 'fail').length
  const verificationScore = summary.verification.length > 0
    ? clampScore(((passCount + warnCount * 0.5) / summary.verification.length) * 100)
    : 0
  const firstPassScore = summary.totalStages > 0
    ? clampScore((summary.approvedFirstPass / summary.totalStages) * 100)
    : 0
  const readinessScore = clampScore((verificationScore * 0.6) + (firstPassScore * 0.4))

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-zinc-900 to-zinc-950 p-8">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-orange-300">
            <Rocket className="h-4 w-4" />
            Forge Share
          </div>
          <h1 className="mt-3 text-3xl font-semibold">{summary.projectName}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            This shared run captures a completed Forge delivery with verification results, cost and timing signals, and the generated output footprint.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                Readiness
              </div>
              <div className="mt-2 text-3xl font-semibold">{readinessScore}%</div>
              <p className="mt-1 text-xs text-zinc-500">Shareable buyer-facing confidence snapshot</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                <Clock3 className="h-3.5 w-3.5 text-orange-400" />
                Time
              </div>
              <div className="mt-2 text-3xl font-semibold">{summary.totalDurationFormatted}</div>
              <p className="mt-1 text-xs text-zinc-500">{summary.totalStages} stages completed</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                <Coins className="h-3.5 w-3.5 text-emerald-400" />
                Cost
              </div>
              <div className="mt-2 text-3xl font-semibold">{summary.costFormatted}</div>
              <p className="mt-1 text-xs text-zinc-500">{summary.roiMultiple}x ROI estimate</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
                <FileText className="h-3.5 w-3.5 text-purple-400" />
                Files
              </div>
              <div className="mt-2 text-3xl font-semibold">{summary.totalFilesGenerated}</div>
              <p className="mt-1 text-xs text-zinc-500">Generated deliverables in this run</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Verification Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.verification.map((check) => (
                <div key={check.name} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-zinc-200">{check.name}</div>
                    <span className={`text-xs ${
                      check.status === 'pass'
                        ? 'text-emerald-400'
                        : check.status === 'warn'
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    }`}>
                      {check.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">Expected: {check.expected}</p>
                  <p className="text-xs text-zinc-500">Actual: {check.actual}</p>
                  {check.detail && <p className="mt-1 text-xs text-zinc-400">{check.detail}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  Delivery Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-zinc-400">
                <p>Pipeline type: <span className="text-zinc-200">{summary.pipelineType}</span></p>
                <p>Approved first pass: <span className="text-zinc-200">{summary.approvedFirstPass} / {summary.totalStages}</span></p>
                <p>Verification mix: <span className="text-zinc-200">{passCount} pass, {warnCount} warn, {failCount} fail</span></p>
                <p>Completed at: <span className="text-zinc-200">{summary.completedAt ? new Date(summary.completedAt).toLocaleString() : 'N/A'}</span></p>
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitBranch className="h-4 w-4 text-orange-400" />
                  Output Footprint
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-zinc-400">
                  {summary.fileList.slice(0, 10).map((file) => (
                    <div key={file.path} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                      <span className="truncate text-zinc-200">{file.path}</span>
                      <span className="text-xs text-zinc-500">{file.language}</span>
                    </div>
                  ))}
                  {summary.fileList.length > 10 && (
                    <p className="text-xs text-zinc-500">+ {summary.fileList.length - 10} more files in the generated output</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
