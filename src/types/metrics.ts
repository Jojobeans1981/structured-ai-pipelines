export interface MetricsSummaryItem {
  totalRuns: number;
  successCount: number;
  successRate: number;
  avgDurationMs: number;
  avgFirstPassRate: number;
  totalRejections: number;
}

export interface MetricsSummary {
  build: MetricsSummaryItem;
  diagnostic: MetricsSummaryItem;
}

export interface MetricHistoryEntry {
  id: string;
  pipelineType: string;
  totalDurationMs: number;
  stageCount: number;
  approvedFirstPass: number;
  rejectionCount: number;
  outcome: string;
  stageDurations: Record<string, number>;
  createdAt: string;
  projectName: string;
  runId: string;
}
