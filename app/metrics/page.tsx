'use client';

import { useState } from 'react';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { useMetricsSummary, useMetricsHistory } from '@/src/hooks/use-metrics';
import { MetricsCards } from '@/src/components/metrics/metrics-cards';
import { StageTimeChart } from '@/src/components/metrics/stage-time-chart';
import { HistoryTable } from '@/src/components/metrics/history-table';
import { BarChart3 } from 'lucide-react';

function avgStageDurations(history: { stageDurations: Record<string, number> }[]): Record<string, number> {
  const totals: Record<string, { sum: number; count: number }> = {};
  for (const entry of history) {
    for (const [name, ms] of Object.entries(entry.stageDurations)) {
      if (!totals[name]) totals[name] = { sum: 0, count: 0 };
      totals[name].sum += ms;
      totals[name].count++;
    }
  }
  const result: Record<string, number> = {};
  for (const [name, { sum, count }] of Object.entries(totals)) {
    result[name] = Math.round(sum / count);
  }
  return result;
}

export default function MetricsPage() {
  const [tab, setTab] = useState('build');
  const { data: summary, isLoading: summaryLoading } = useMetricsSummary();
  const { data: buildHistory, isLoading: buildLoading, loadMore: loadMoreBuild } = useMetricsHistory('build');
  const { data: diagHistory, isLoading: diagLoading, loadMore: loadMoreDiag } = useMetricsHistory('diagnostic');

  const isLoading = summaryLoading || buildLoading || diagLoading;

  return (
    <>
      <Header title="Metrics" />
      <PageContainer>
        <div className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-20 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ))}
            </div>
          ) : summary && (summary.build.totalRuns > 0 || summary.diagnostic.totalRuns > 0) ? (
            <MetricsCards summary={summary} />
          ) : summary ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold">No completed runs yet</h3>
              <p className="text-sm text-muted-foreground">Complete a pipeline run to see metrics here. In-progress and cancelled runs will also show once they finish.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold">No metrics yet</h3>
              <p className="text-sm text-muted-foreground">Complete a pipeline run to see metrics here.</p>
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="build">Build Pipeline</TabsTrigger>
              <TabsTrigger value="diagnostic">Diagnostic Pipeline</TabsTrigger>
            </TabsList>

            <TabsContent value="build" className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Stage Durations</CardTitle></CardHeader>
                <CardContent>
                  <StageTimeChart stageDurations={avgStageDurations(buildHistory)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Run History</CardTitle></CardHeader>
                <CardContent>
                  <HistoryTable history={buildHistory} onLoadMore={loadMoreBuild} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="diagnostic" className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Stage Durations</CardTitle></CardHeader>
                <CardContent>
                  <StageTimeChart stageDurations={avgStageDurations(diagHistory)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Run History</CardTitle></CardHeader>
                <CardContent>
                  <HistoryTable history={diagHistory} onLoadMore={loadMoreDiag} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Learning Store */}
          <LearningStorePanel />
        </div>
      </PageContainer>
    </>
  );
}

function LearningStorePanel() {
  const [data, setData] = useState<{
    patterns: Array<{ id: string; pattern: string; sourceAgent: string; targetAgent: string; rejectionCount: number; status: string }>;
    stats: { totalPatterns: number; activePatterns: number; resolvedPatterns: number; totalRejections: number; topOffenders: Array<{ agent: string; count: number }> };
  } | null>(null);

  useState(() => {
    fetch('/api/learning').then(r => r.ok ? r.json() : null).then(j => j && setData(j.data)).catch(() => {});
  });

  if (!data || data.patterns.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-orange-400" />
          Learning Store — Self-Improvement Patterns
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
            <div className="text-zinc-500 text-xs">Active Patterns</div>
            <div className="text-xl font-bold text-orange-400">{data.stats.activePatterns}</div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
            <div className="text-zinc-500 text-xs">Resolved</div>
            <div className="text-xl font-bold text-emerald-400">{data.stats.resolvedPatterns}</div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
            <div className="text-zinc-500 text-xs">Total Rejections</div>
            <div className="text-xl font-bold text-red-400">{data.stats.totalRejections}</div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
            <div className="text-zinc-500 text-xs">Top Offender</div>
            <div className="text-sm font-medium text-zinc-200 truncate">{data.stats.topOffenders[0]?.agent || '—'}</div>
          </div>
        </div>
        <div className="space-y-2">
          {data.patterns.slice(0, 5).map((p) => (
            <div key={p.id} className="flex items-start gap-3 text-sm py-2 px-3 rounded-lg border border-zinc-700/30 bg-zinc-800/20">
              <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${p.status === 'active' ? 'bg-orange-400' : 'bg-emerald-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-zinc-300 text-xs truncate">{p.pattern}</div>
                <div className="text-zinc-600 text-xs mt-0.5">{p.sourceAgent} → {p.targetAgent} · seen {p.rejectionCount}x</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
