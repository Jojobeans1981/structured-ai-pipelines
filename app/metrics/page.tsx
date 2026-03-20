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
        </div>
      </PageContainer>
    </>
  );
}
