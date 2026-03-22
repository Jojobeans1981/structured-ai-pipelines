'use client';

import { Card, CardContent } from '@/src/components/ui/card';
import { CheckCircle, Wrench, ThumbsUp, Coins, Zap, AlertTriangle } from 'lucide-react';
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
          subtext={item.feedbackCount > 0 ? `${item.feedbackCount} responses` : 'Download to rate'}
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
  return (
    <div className="space-y-4">
      {renderRow('Build Pipeline', summary.build)}
      {renderRow('Diagnostic Pipeline', summary.diagnostic)}
    </div>
  );
}
