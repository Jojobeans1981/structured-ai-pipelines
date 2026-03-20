'use client';

import { Card, CardContent } from '@/src/components/ui/card';
import { Activity, CheckCircle, Clock, ThumbsUp, Cpu, Coins } from 'lucide-react';
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
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <StatCard icon={Activity} label="Total Runs" value={String(item.totalRuns)} />
        <StatCard icon={CheckCircle} label="Success Rate" value={item.totalRuns > 0 ? `${item.successRate}%` : '\u2014'} color={item.totalRuns > 0 ? rateColor(item.successRate) : undefined} />
        <StatCard icon={Clock} label="Avg Duration" value={item.totalRuns > 0 ? formatDuration(item.avgDurationMs) : '\u2014'} />
        <StatCard icon={ThumbsUp} label="First-Pass Rate" value={item.totalRuns > 0 ? `${item.avgFirstPassRate}%` : '\u2014'} color={item.totalRuns > 0 ? rateColor(item.avgFirstPassRate) : undefined} />
        <StatCard icon={Cpu} label="Total Tokens" value={item.totalInputTokens + item.totalOutputTokens > 0 ? `${((item.totalInputTokens + item.totalOutputTokens) / 1000).toFixed(1)}k` : '\u2014'} subtext={item.totalInputTokens > 0 ? `${(item.totalInputTokens / 1000).toFixed(1)}k in / ${(item.totalOutputTokens / 1000).toFixed(1)}k out` : undefined} />
        <StatCard icon={Coins} label="Total Cost" value={item.totalCostUsd > 0 ? `$${item.totalCostUsd.toFixed(2)}` : '$0.00'} color={item.totalCostUsd > 0 ? 'text-emerald-500' : undefined} />
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
