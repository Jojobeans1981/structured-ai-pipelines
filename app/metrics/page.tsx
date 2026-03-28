'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { useMetricsSummary, useMetricsHistory } from '@/src/hooks/use-metrics';
import { MetricsCards } from '@/src/components/metrics/metrics-cards';
import { StageTimeChart } from '@/src/components/metrics/stage-time-chart';
import { HistoryTable } from '@/src/components/metrics/history-table';
import { BarChart3, BookOpen, AlertTriangle, Shield, Brain, Users } from 'lucide-react';

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

          {/* Prompt Health + Learning Store side by side — stretch to equal height */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <div className="flex flex-col">
              <PromptHealthPanel />
            </div>
            <div className="flex flex-col">
              <LearningStorePanel />
            </div>
          </div>

          {/* Agent Performance Breakdown */}
          <AgentBreakdownPanel />

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

function PromptHealthPanel() {
  const [health, setHealth] = useState<{
    totalEvaluations: number;
    passRate: number;
    avgConfidence: number;
    totalRetries: number;
    recentScores?: Array<{ score: number; passed: boolean; createdAt: string }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/prompt-health')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setHealth(j.data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            Prompt Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health || health.totalEvaluations === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            Prompt Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sentinel evaluations recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  const recentScores = health.recentScores || [];
  const highScores = recentScores.filter((s) => s.score >= 0.9).length;
  const midScores = recentScores.filter((s) => s.score >= 0.8 && s.score < 0.9).length;
  const lowScores = recentScores.filter((s) => s.score < 0.8).length;

  return (
    <Card className="flex-1 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-400" />
          Prompt Health — Sentinel Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 text-sm">
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-2.5 text-center">
            <div className="text-zinc-500 text-[10px]">Evals</div>
            <div className="text-lg font-bold text-zinc-200">{health.totalEvaluations}</div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-2.5 text-center">
            <div className="text-zinc-500 text-[10px]">Pass Rate</div>
            <div className={`text-lg font-bold ${health.passRate >= 80 ? 'text-emerald-400' : 'text-red-400'}`}>
              {health.passRate}%
            </div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-2.5 text-center">
            <div className="text-zinc-500 text-[10px]">Avg Score</div>
            <div className={`text-lg font-bold ${health.avgConfidence >= 80 ? 'text-emerald-400' : 'text-yellow-400'}`}>
              {health.avgConfidence}%
            </div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-2.5 text-center">
            <div className="text-zinc-500 text-[10px]">Retries</div>
            <div className="text-lg font-bold text-orange-400">{health.totalRetries}</div>
          </div>
        </div>

        {/* Confidence threshold bar */}
        <div>
          <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
            <span>Confidence Threshold</span>
            <span>{health.avgConfidence}% avg</span>
          </div>
          <div className="relative h-4 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all ${health.avgConfidence >= 80 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-amber-600 to-amber-400'}`}
              style={{ width: `${health.avgConfidence}%` }}
            />
            <div className="absolute left-[80%] top-0 h-full w-0.5 bg-zinc-400/50" />
            <div className="absolute left-[80%] -top-3.5 text-[9px] text-zinc-500 -translate-x-1/2">80%</div>
          </div>
        </div>

        {/* Recent scores — bar chart grows to fill space */}
        {recentScores.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="text-zinc-500 text-[10px] mb-1.5">Last {recentScores.length} Evaluations</div>
            <div className="flex items-end gap-1.5 flex-1 min-h-[7rem]">
              {recentScores.slice().reverse().map((s, i) => {
                const barHeight = Math.max(15, (s.score * 100) - 50) * 2;
                const color = s.score >= 0.9 ? 'bg-emerald-500' : s.score >= 0.8 ? 'bg-amber-500' : 'bg-red-500';
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${(s.score * 100).toFixed(0)}% — ${new Date(s.createdAt).toLocaleString()}`}>
                    <div className="text-[9px] text-zinc-600 mb-0.5">{(s.score * 100).toFixed(0)}</div>
                    <div
                      className={`w-full rounded-t ${color} hover:brightness-125 transition-all cursor-default`}
                      style={{ height: `${barHeight}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>Oldest</span>
              <span>Latest</span>
            </div>
          </div>
        )}

        {/* Score distribution */}
        {recentScores.length > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
              <div className="text-lg font-bold text-emerald-400">{highScores}</div>
              <div className="text-[10px] text-zinc-500">Excellent (90%+)</div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-lg font-bold text-amber-400">{midScores}</div>
              <div className="text-[10px] text-zinc-500">Good (80-89%)</div>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
              <div className="text-lg font-bold text-red-400">{lowScores}</div>
              <div className="text-[10px] text-zinc-500">Rejected (&lt;80%)</div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-600 pt-1 border-t border-zinc-800/50">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> 90%+</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-amber-500" /> 80-89%</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500" /> &lt;80% rejected</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface LearningPattern {
  id: string;
  pattern: string;
  sourceAgent: string;
  targetAgent: string;
  rejectionCount: number;
  status: string;
  resolution?: string | null;
}

interface LearningStats {
  totalPatterns: number;
  activePatterns: number;
  resolvedPatterns: number;
  totalRejections: number;
  topOffenders: Array<{ agent: string; count: number }>;
}

interface AgentBreakdown {
  agentRejections: Array<{ agent: string; rejections: number; source: string }>;
  agentCosts: Array<{ agent: string; totalCost: number; avgCost: number; runs: number }>;
  confidenceTrend: Array<{ date: string; avgScore: number; count: number }>;
  guardianStats: { totalChecks: number; driftDetected: number; passRate: number };
  socraticStats: { interventions: number; autoResolved: number };
}

function AgentBreakdownPanel() {
  const [data, setData] = useState<AgentBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/agents')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setData(j))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-400" />
            Agent Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasData = data.agentRejections.length > 0 || data.agentCosts.length > 0;
  if (!hasData && data.guardianStats.totalChecks === 0 && data.socraticStats.interventions === 0) {
    return null; // No data yet — don't show empty panel
  }

  return (
    <div className="space-y-4">
      {/* Guardian + Socratic stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-cyan-400" />
              Guardian — Context Integrity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <div className="text-zinc-500 text-xs">Total Checks</div>
                <div className="text-xl font-bold text-zinc-200">{data.guardianStats.totalChecks}</div>
              </div>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <div className="text-zinc-500 text-xs">Drift Detected</div>
                <div className="text-xl font-bold text-red-400">{data.guardianStats.driftDetected}</div>
              </div>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <div className="text-zinc-500 text-xs">Pass Rate</div>
                <div className={`text-xl font-bold ${data.guardianStats.passRate >= 80 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                  {data.guardianStats.passRate}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-400" />
              Socrates — Clarification Agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <div className="text-zinc-500 text-xs">Interventions</div>
                <div className="text-xl font-bold text-purple-400">{data.socraticStats.interventions}</div>
              </div>
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
                <div className="text-zinc-500 text-xs">Auto-Resolved</div>
                <div className="text-xl font-bold text-emerald-400">{data.socraticStats.autoResolved}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Rejections + Costs */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.agentRejections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  Rejections by Agent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.agentRejections.slice(0, 10).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1.5 px-3 rounded border border-zinc-700/30 bg-zinc-800/20">
                      <div>
                        <span className="text-zinc-300 font-medium">{r.agent}</span>
                        <span className="text-zinc-600 text-xs ml-2">from {r.source}</span>
                      </div>
                      <span className="text-red-400 font-mono text-sm">{r.rejections}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.agentCosts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                  Cost by Agent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.agentCosts.slice(0, 10).map((c, i) => {
                    const maxCost = data.agentCosts[0]?.totalCost || 1;
                    const width = Math.max(5, Math.round((c.totalCost / maxCost) * 100));
                    return (
                      <div key={i} className="text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-zinc-300">{c.agent}</span>
                          <span className="text-emerald-400 font-mono">${c.totalCost.toFixed(3)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <div className="text-zinc-600 text-xs mt-0.5">{c.runs} runs · avg ${c.avgCost.toFixed(4)}/run</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Confidence Trend */}
      {data.confidenceTrend.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              Confidence Trend (Daily Average)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-32">
              {data.confidenceTrend.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-zinc-500">{d.avgScore}%</span>
                  <div
                    className={`w-full rounded-t ${d.avgScore >= 80 ? 'bg-emerald-500' : d.avgScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ height: `${Math.max(4, d.avgScore)}%` }}
                  />
                  <span className="text-xs text-zinc-600 truncate w-full text-center">
                    {d.date.split('-').slice(1).join('/')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LearningStorePanel() {
  const [data, setData] = useState<{ patterns: LearningPattern[]; stats: LearningStats } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    fetch('/api/learning')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setData(j.data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-orange-400" />
            Learning Store
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.stats.totalPatterns === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-orange-400" />
            Learning Store
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No rejection patterns recorded yet. Patterns appear here when the sentinel catches issues during pipeline runs.</p>
        </CardContent>
      </Card>
    );
  }

  const displayPatterns = showResolved
    ? data.patterns
    : data.patterns.filter((p) => p.status === 'active');

  return (
    <Card className="flex-1 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-orange-400" />
          Learning Store — What the Forge Remembers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-zinc-600 -mt-1">
          Quality gates catch bad output and record patterns. The forge injects warnings so agents don&apos;t repeat mistakes.
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3" title="Mistakes the forge keeps making — warnings are injected before each agent run to prevent repeats">
            <div className="text-zinc-500 text-xs">Recurring Issues</div>
            <div className="text-xl font-bold text-orange-400">{data.stats.activePatterns}</div>
            <div className="text-zinc-600 text-[10px] mt-0.5">Still happening — agents get warned</div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3" title="Issues that were caught, warned about, and subsequently fixed in later runs">
            <div className="text-zinc-500 text-xs">Lessons Learned</div>
            <div className="text-xl font-bold text-emerald-400">{data.stats.resolvedPatterns}</div>
            <div className="text-zinc-600 text-[10px] mt-0.5">Fixed — forge won&apos;t repeat these</div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3" title="Total times a quality gate (Sentinel, Inspector, Guardian) caught bad output across all runs">
            <div className="text-zinc-500 text-xs">Times Caught</div>
            <div className="text-xl font-bold text-red-400">{data.stats.totalRejections}</div>
            <div className="text-zinc-600 text-[10px] mt-0.5">Total catches by all quality gates</div>
          </div>
          <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3" title="The agent that produces the most rejected output — targeted for improvement">
            <div className="text-zinc-500 text-xs">Weakest Agent</div>
            <div className="text-sm font-medium text-zinc-200 truncate">
              {data.stats.topOffenders[0]?.agent || '—'}
            </div>
            <div className="text-zinc-600 text-[10px] mt-0.5">Most rejections — needs improvement</div>
          </div>
        </div>

        {data.stats.resolvedPatterns > 0 && (
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {showResolved ? 'Hide resolved' : `Show resolved (${data.stats.resolvedPatterns})`}
          </button>
        )}

        <div className="space-y-2">
          {displayPatterns.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No active patterns — all resolved.</p>
          ) : (
            displayPatterns.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-start gap-3 text-sm py-2 px-3 rounded-lg border border-zinc-700/30 bg-zinc-800/20">
                <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${p.status === 'active' ? 'bg-orange-400' : 'bg-emerald-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-300 text-xs">{p.pattern}</div>
                  <div className="text-zinc-600 text-xs mt-0.5">
                    {p.sourceAgent} → {p.targetAgent} · seen {p.rejectionCount}x
                    {p.status === 'resolved' && p.resolution && (
                      <span className="text-emerald-500 ml-1">· {p.resolution}</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
