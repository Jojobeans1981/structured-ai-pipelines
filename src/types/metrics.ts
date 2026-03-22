export interface MetricsSummaryItem {
  totalRuns: number;
  // Quality metrics
  buildPassRate: number;       // % of runs where verify passed (no auto-fix needed)
  workedOutOfBoxRate: number;  // % of downloads where user said "it worked"
  autoFixRate: number;         // % of runs that needed auto-fix cycles
  avgAutoFixCycles: number;    // average auto-fix cycles per run that needed fixing
  // Cost metrics
  totalCostUsd: number;
  avgCostPerRun: number;
  // Speed metrics
  avgLlmTimeMs: number;       // average LLM execution time (excludes human wait)
  // Volume
  totalRejections: number;    // sentinel + human rejections
  feedbackCount: number;
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
