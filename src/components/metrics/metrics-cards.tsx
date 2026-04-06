'use client';

import { Card, CardContent } from '@/src/components/ui/card';
import { CheckCircle, Wrench, ThumbsUp, Coins, Zap, AlertTriangle, Gauge, Layers3, Sparkles } from 'lucide-react';
import { formatDuration } from '@/src/lib/utils';
import { type MetricsSummary, type MetricsSummaryItem } from '@/src/types/metrics';

interface MetricsCardsProps {
  summary: MetricsSummary;
}

function StatCard({ icon: Icon, label, value, subtext, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${color || 'text-muted-foreground'}`} />
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function rateColor(rate: number): string {
  if (rate >= 80) return 'text-green-500';
  if (rate >= 50) return 'text-yellow-500';
  return 'text-red-500';
}

function renderRow(label: string, item: MetricsSummaryItem) {
  if (item.totalRuns === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium text-muted-foreground">{label} — {item.totalRuns} runs</h4>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <StatCard
          icon={CheckCircle}
          label="Build Pass Rate"
          value={`${item.buildPassRate}%`}
          subtext="Compiled without auto-fix"
          color={rateColor(item.buildPassRate)}
        />
        <StatCard
          icon={ThumbsUp}
          label="Worked Out of Box"
          value={item.feedbackCount > 0 ? `${item.workedOutOfBoxRate}%` : 'No feedback'}
          subtext={item.feedbackCount > 0 ? `${item.feedbackCount} responses` : 'No ratings yet'}
          color={item.feedbackCount > 0 ? rateColor(item.workedOutOfBoxRate) : undefined}
        />
        <StatCard
          icon={Wrench}
          label="Needed Auto-Fix"
          value={`${item.autoFixRate}%`}
          subtext={item.avgAutoFixCycles > 0 ? `avg ${item.avgAutoFixCycles} cycles` : 'No retries needed'}
          color={item.autoFixRate > 30 ? 'text-yellow-500' : 'text-green-500'}
        />
        <StatCard
          icon={Zap}
          label="Avg LLM Time"
          value={item.avgLlmTimeMs > 0 ? formatDuration(item.avgLlmTimeMs) : '\u2014'}
          subtext="Excludes human wait"
        />
        <StatCard
          icon={Coins}
          label="Avg Cost / Run"
          value={item.avgCostPerRun > 0 ? `$${item.avgCostPerRun.toFixed(3)}` : '$0'}
          subtext={`$${item.totalCostUsd.toFixed(2)} total`}
          color="text-emerald-500"
        />
        <StatCard
          icon={AlertTriangle}
          label="Total Rejections"
          value={String(item.totalRejections)}
          subtext="Sentinel + human + auto-fix"
          color={item.totalRejections > 10 ? 'text-red-500' : item.totalRejections > 0 ? 'text-yellow-500' : 'text-green-500'}
        />
      </div>
    </div>
  );
}

export function MetricsCards({ summary }: MetricsCardsProps) {
  const totalRuns = summary.build.totalRuns + summary.diagnostic.totalRuns;
  const totalCost = summary.build.totalCostUsd + summary.diagnostic.totalCostUsd;
  const avgSuccessSignal = totalRuns > 0
    ? Math.round(
        ((summary.build.buildPassRate * summary.build.totalRuns) + (summary.diagnostic.buildPassRate * summary.diagnostic.totalRuns)) /
        totalRuns
      )
    : 0;

  let planFit = 'Starter';
  let planHint = 'Quick evaluations, demos, and prompt iteration.';
  if (totalRuns >= 15 || totalCost >= 10) {
    planFit = 'Studio';
    planHint = 'You are using Forge like a repeatable delivery tool. Shared templates and deploy flows are the next value unlock.';
  }
  if (totalRuns >= 40 || totalCost >= 50) {
    planFit = 'Team Workspace';
    planHint = 'Your usage pattern points toward collaboration, approvals, usage controls, and production delivery workflows.';
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Gauge className="h-5 w-5 text-cyan-400" />
              <div>
                <p className="text-xs text-muted-foreground">Readiness Signal</p>
                <p className="text-lg font-semibold">{avgSuccessSignal}%</p>
                <p className="text-xs text-muted-foreground">Weighted by completed run volume</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Layers3 className="h-5 w-5 text-orange-400" />
              <div>
                <p className="text-xs text-muted-foreground">Recommended Lane</p>
                <p className="text-lg font-semibold">{planFit}</p>
                <p className="text-xs text-muted-foreground">{planHint}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-xs text-muted-foreground">Usage Snapshot</p>
                <p className="text-lg font-semibold">{totalRuns} total runs</p>
                <p className="text-xs text-muted-foreground">${totalCost.toFixed(2)} tracked model spend</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {renderRow('Build Pipeline', summary.build)}
      {renderRow('Diagnostic Pipeline', summary.diagnostic)}
    </div>
  );
}
