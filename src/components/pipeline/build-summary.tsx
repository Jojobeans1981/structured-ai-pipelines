'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import {
  FileText, Clock, Coins, Shield, CheckCircle, XCircle,
  AlertTriangle, Hash, GitBranch, Download, Cpu,
} from 'lucide-react';
import { Button } from '@/src/components/ui/button';

interface VerificationCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  expected: string;
  actual: string;
  detail?: string;
}

interface StageSummary {
  displayName: string;
  skillName: string;
  status: string;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string | null;
  backend: string | null;
  wasRejected: boolean;
  retryCount: number;
}

interface SummaryData {
  runId: string;
  projectName: string;
  pipelineType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalDurationMs: number;
  totalDurationFormatted: string;
  stages: StageSummary[];
  totalStages: number;
  approvedFirstPass: number;
  rejectedStages: number;
  skippedStages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  costFormatted: string;
  totalFilesGenerated: number;
  fileList: Array<{ path: string; language: string; sizeBytes: number }>;
  traceId: string | null;
  totalTraceEvents: number;
  totalAgentVotes: number;
  agentDecisionCount: number;
  verification: VerificationCheck[];
  verificationHash: string;
  verifiedAt: string;
  allChecksPass: boolean;
  estimatedEngineerHours: number;
  estimatedEngineerCost: number;
  roiMultiple: number;
}

const STATUS_ICONS = {
  pass: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  fail: <XCircle className="h-4 w-4 text-red-400" />,
  warn: <AlertTriangle className="h-4 w-4 text-yellow-400" />,
};

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
      <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

export function BuildSummaryPanel({ runId }: { runId: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch(`/api/pipeline/${runId}/summary`);
        if (!res.ok) {
          if (res.status === 404) { setData(null); return; }
          throw new Error('Failed to fetch summary');
        }
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [runId]);

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-zinc-500">Generating build summary...</CardContent></Card>;
  }
  if (error) {
    return <Card><CardContent className="py-8 text-center text-red-400">{error}</CardContent></Card>;
  }
  if (!data) return null;

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `build-summary-${runId.slice(-8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-400" />
              Build Summary — {data.projectName}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
          </div>
          <p className="text-xs text-zinc-500 font-mono">
            Run: {data.runId} · Verified: {new Date(data.verifiedAt).toLocaleString()}
          </p>
        </CardHeader>
        <CardContent>
          {/* Stat grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Wall Clock"
              value={data.totalDurationFormatted}
              sub={`Compute: ${(data as unknown as Record<string, unknown>).computeTimeFormatted || '—'} · ${data.totalStages} stages`}
            />
            <StatCard
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="Tokens"
              value={`${(data.totalTokens / 1000).toFixed(1)}k`}
              sub={`${(data.totalInputTokens / 1000).toFixed(1)}k in / ${(data.totalOutputTokens / 1000).toFixed(1)}k out`}
            />
            <StatCard
              icon={<Coins className="h-3.5 w-3.5" />}
              label="API Cost"
              value={data.costFormatted}
              sub={data.roiMultiple > 0 ? `${data.roiMultiple}x ROI vs engineer` : 'Free model'}
            />
            <StatCard
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Files"
              value={`${data.totalFilesGenerated}`}
              sub={`${data.fileList.reduce((s, f) => s + f.sizeBytes, 0)} bytes total`}
            />
          </div>

          {/* ROI callout */}
          {data.roiMultiple > 0 && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-sm text-emerald-300">
                Estimated equivalent: <strong>{data.estimatedEngineerHours}hrs</strong> of engineer time
                (${data.estimatedEngineerCost} at $150/hr) vs <strong>{data.costFormatted}</strong> in API costs
                — <strong>{data.roiMultiple}x cost savings</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-zinc-300">Stage Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {data.stages.map((stage, i) => (
              <div key={i} className="flex items-center gap-3 text-sm py-1.5 px-2 rounded hover:bg-zinc-800/30">
                <span className="w-6 text-center text-zinc-600">{i + 1}</span>
                <span className={`w-2 h-2 rounded-full ${
                  stage.status === 'approved' ? 'bg-emerald-400' :
                  stage.status === 'skipped' ? 'bg-zinc-600' :
                  stage.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                }`} />
                <span className="flex-1 text-zinc-200 truncate">{stage.displayName}</span>
                {stage.wasRejected && (
                  <span className="text-xs text-yellow-500">rejected {stage.retryCount > 0 ? `×${stage.retryCount}` : ''}</span>
                )}
                <span className="text-xs text-zinc-500 w-16 text-right">
                  {stage.durationMs ? `${(stage.durationMs / 1000).toFixed(1)}s` : '—'}
                </span>
                <span className="text-xs text-zinc-500 w-14 text-right">
                  {stage.inputTokens + stage.outputTokens > 0
                    ? `${((stage.inputTokens + stage.outputTokens) / 1000).toFixed(1)}k`
                    : '—'}
                </span>
                <span className="text-xs text-zinc-600 w-20 text-right truncate">
                  {stage.model || stage.backend || '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500 border-t border-zinc-700/50 pt-3">
            <span>{data.approvedFirstPass} approved first pass</span>
            <span>{data.rejectedStages} rejected</span>
            <span>{data.skippedStages} skipped</span>
          </div>
        </CardContent>
      </Card>

      {/* Verification */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-cyan-400" />
            Verification Checks
            {data.allChecksPass ? (
              <span className="text-xs text-emerald-400 ml-auto">All checks pass</span>
            ) : (
              <span className="text-xs text-yellow-400 ml-auto">Some checks need attention</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.verification.map((check, i) => (
              <div key={i} className="flex items-start gap-3 text-sm py-1.5">
                {STATUS_ICONS[check.status]}
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-200">{check.name}</div>
                  <div className="text-xs text-zinc-500">
                    Expected: {check.expected} · Actual: {check.actual}
                  </div>
                  {check.detail && (
                    <div className="text-xs text-zinc-600 mt-0.5">{check.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-600 border-t border-zinc-700/50 pt-3">
            <Hash className="h-3 w-3" />
            <span className="font-mono truncate">SHA-256: {data.verificationHash}</span>
          </div>
        </CardContent>
      </Card>

      {/* Trace info */}
      {data.traceId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <GitBranch className="h-4 w-4 text-purple-400" />
              Observability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-zinc-500 text-xs">Trace Events</div>
                <div className="text-zinc-200 font-medium">{data.totalTraceEvents}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs">Agent Votes</div>
                <div className="text-zinc-200 font-medium">{data.totalAgentVotes}</div>
              </div>
              <div>
                <div className="text-zinc-500 text-xs">Agent Decisions</div>
                <div className="text-zinc-200 font-medium">{data.agentDecisionCount}</div>
              </div>
            </div>
            <p className="text-xs font-mono text-zinc-600 mt-2">Trace ID: {data.traceId}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
