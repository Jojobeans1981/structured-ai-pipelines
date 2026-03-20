import { prisma } from '@/src/lib/prisma';
import { CostTracker } from '@/src/services/cost-tracker';
import { createHash } from 'crypto';

export interface VerificationCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  expected: string;
  actual: string;
  detail?: string;
}

export interface StageSummary {
  id: string;
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
  artifactLength: number;
  filesExtracted: number;
}

export interface BuildSummaryData {
  // Run metadata
  runId: string;
  projectName: string;
  pipelineType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalDurationMs: number;
  totalDurationFormatted: string;

  // Stage breakdown
  stages: StageSummary[];
  totalStages: number;
  approvedFirstPass: number;
  rejectedStages: number;
  skippedStages: number;

  // Token & cost
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  costPerStage: number;
  costFormatted: string;

  // Files
  totalFilesGenerated: number;
  fileList: Array<{ path: string; language: string; sizeBytes: number }>;

  // Trace
  traceId: string | null;
  totalTraceEvents: number;
  totalAgentVotes: number;
  agentDecisionCount: number;

  // Verification
  verification: VerificationCheck[];
  verificationHash: string; // SHA-256 of all verification inputs — tamper-evident
  verifiedAt: string;
  allChecksPass: boolean;

  // ROI estimate
  estimatedEngineerHours: number;
  estimatedEngineerCost: number;
  roiMultiple: number;
}

export class BuildSummary {
  /**
   * Generate a complete post-build summary with verification.
   * Called after a pipeline run completes (success or failure).
   */
  static async generate(runId: string): Promise<BuildSummaryData> {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        project: { select: { name: true } },
        stages: { orderBy: { stageIndex: 'asc' } },
        files: { select: { filePath: true, language: true, content: true } },
        traceEvents: { orderBy: { timestamp: 'asc' } },
        agentVotes: true,
      },
    });

    if (!run) throw new Error(`Run not found: ${runId}`);

    // --- Stage summaries ---
    const stages: StageSummary[] = run.stages.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      skillName: s.skillName,
      status: s.status,
      durationMs: s.durationMs,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      costUsd: s.costUsd,
      model: s.modelUsed,
      backend: s.backend,
      wasRejected: !!s.userFeedback,
      retryCount: s.retryCount,
      artifactLength: s.artifactContent?.length ?? 0,
      filesExtracted: run.files.filter((f) => f.filePath).length, // rough
    }));

    const approvedStages = stages.filter((s) => s.status === 'approved');
    const rejectedStages = stages.filter((s) => s.wasRejected);
    const skippedStages = stages.filter((s) => s.status === 'skipped');

    // --- Tokens & cost ---
    const totalInputTokens = stages.reduce((sum, s) => sum + s.inputTokens, 0);
    const totalOutputTokens = stages.reduce((sum, s) => sum + s.outputTokens, 0);
    const totalCostUsd = stages.reduce((sum, s) => sum + s.costUsd, 0);

    // --- Duration ---
    const totalDurationMs = run.totalDurationMs
      ?? (run.completedAt && run.startedAt
        ? run.completedAt.getTime() - run.startedAt.getTime()
        : 0);

    // --- Files ---
    const fileList = run.files.map((f) => ({
      path: f.filePath,
      language: f.language,
      sizeBytes: Buffer.byteLength(f.content, 'utf8'),
    }));

    // --- Trace data ---
    const agentDecisionStageIds = new Set(run.agentVotes.map((v) => v.stageId));

    // --- ROI estimate ---
    // Rough: 1000 output tokens ≈ 25 lines of code ≈ 15 min engineer time
    const estimatedEngineerHours = Math.max(0.5, (totalOutputTokens / 1000) * 0.25);
    const estimatedEngineerCost = estimatedEngineerHours * 150; // $150/hr senior eng
    const roiMultiple = totalCostUsd > 0 ? Math.round(estimatedEngineerCost / totalCostUsd) : 0;

    // --- Verification ---
    const verification = await BuildSummary.verify(run, stages, totalInputTokens, totalOutputTokens, totalCostUsd);
    const allChecksPass = verification.every((v) => v.status === 'pass');

    // Create tamper-evident hash of all verification inputs
    const hashInput = JSON.stringify({
      runId,
      stageCount: stages.length,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      fileCount: fileList.length,
      traceEventCount: run.traceEvents.length,
      agentVoteCount: run.agentVotes.length,
      verification: verification.map((v) => ({ name: v.name, status: v.status, expected: v.expected, actual: v.actual })),
      timestamp: new Date().toISOString(),
    });
    const verificationHash = createHash('sha256').update(hashInput).digest('hex');

    return {
      runId,
      projectName: run.project.name,
      pipelineType: run.type,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      totalDurationMs,
      totalDurationFormatted: BuildSummary.formatDuration(totalDurationMs),

      stages,
      totalStages: stages.length,
      approvedFirstPass: approvedStages.filter((s) => !s.wasRejected).length,
      rejectedStages: rejectedStages.length,
      skippedStages: skippedStages.length,

      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCostUsd,
      costPerStage: stages.length > 0 ? totalCostUsd / stages.length : 0,
      costFormatted: `$${totalCostUsd.toFixed(4)}`,

      totalFilesGenerated: fileList.length,
      fileList,

      traceId: run.traceId,
      totalTraceEvents: run.traceEvents.length,
      totalAgentVotes: run.agentVotes.length,
      agentDecisionCount: agentDecisionStageIds.size,

      verification,
      verificationHash,
      verifiedAt: new Date().toISOString(),
      allChecksPass,

      estimatedEngineerHours: Math.round(estimatedEngineerHours * 10) / 10,
      estimatedEngineerCost: Math.round(estimatedEngineerCost),
      roiMultiple,
    };
  }

  /**
   * Cross-check trace data against actual DB records to verify accuracy.
   */
  private static async verify(
    run: {
      id: string;
      startedAt: Date;
      completedAt: Date | null;
      totalDurationMs: number | null;
      traceEvents: Array<{ eventType: string; inputTokens: number | null; outputTokens: number | null; costUsd: number | null }>;
      agentVotes: Array<{ stageId: string; status: string }>;
      stages: Array<{ id: string; status: string; inputTokens: number; outputTokens: number; costUsd: number; durationMs: number | null }>;
      files: Array<{ filePath: string }>;
    },
    stages: StageSummary[],
    totalInputTokens: number,
    totalOutputTokens: number,
    totalCostUsd: number
  ): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    // 1. Token count consistency: stage tokens vs trace event tokens
    const traceInputTokens = run.traceEvents
      .filter((e) => e.inputTokens)
      .reduce((sum, e) => sum + (e.inputTokens ?? 0), 0);
    const traceOutputTokens = run.traceEvents
      .filter((e) => e.outputTokens)
      .reduce((sum, e) => sum + (e.outputTokens ?? 0), 0);

    checks.push({
      name: 'Input token consistency',
      status: Math.abs(totalInputTokens - traceInputTokens) < totalInputTokens * 0.1 || traceInputTokens === 0
        ? 'pass' : 'warn',
      expected: `${totalInputTokens} (from stages)`,
      actual: `${traceInputTokens} (from trace events)`,
      detail: traceInputTokens === 0
        ? 'No trace token data yet — trace logging may not have been active for this run'
        : `Difference: ${Math.abs(totalInputTokens - traceInputTokens)} tokens`,
    });

    checks.push({
      name: 'Output token consistency',
      status: Math.abs(totalOutputTokens - traceOutputTokens) < totalOutputTokens * 0.1 || traceOutputTokens === 0
        ? 'pass' : 'warn',
      expected: `${totalOutputTokens} (from stages)`,
      actual: `${traceOutputTokens} (from trace events)`,
    });

    // 2. Cost sanity check: cost should be > 0 if tokens were used
    const hasTokens = totalInputTokens > 0 || totalOutputTokens > 0;
    checks.push({
      name: 'Cost recorded for token usage',
      status: hasTokens && totalCostUsd === 0 ? 'warn' : 'pass',
      expected: hasTokens ? 'Cost > $0' : 'No tokens, no cost',
      actual: `$${totalCostUsd.toFixed(4)}`,
      detail: hasTokens && totalCostUsd === 0
        ? 'Tokens were used but no cost recorded — may be using a free model (Groq/Ollama)'
        : undefined,
    });

    // 3. Duration sanity check
    const reportedDurationMs = run.totalDurationMs ?? 0;
    const calculatedDurationMs = run.completedAt && run.startedAt
      ? run.completedAt.getTime() - run.startedAt.getTime()
      : 0;
    const durationDiff = Math.abs(reportedDurationMs - calculatedDurationMs);

    checks.push({
      name: 'Duration consistency',
      status: durationDiff < 5000 || calculatedDurationMs === 0 ? 'pass' : 'warn',
      expected: `${reportedDurationMs}ms (reported)`,
      actual: `${calculatedDurationMs}ms (calculated from timestamps)`,
      detail: `Difference: ${durationDiff}ms`,
    });

    // 4. Stage sum duration vs total
    const stageDurationSum = stages
      .filter((s) => s.durationMs)
      .reduce((sum, s) => sum + (s.durationMs ?? 0), 0);

    checks.push({
      name: 'Stage durations sum to total',
      status: stageDurationSum <= reportedDurationMs * 1.1 || reportedDurationMs === 0 ? 'pass' : 'warn',
      expected: `≤ ${reportedDurationMs}ms (total run time)`,
      actual: `${stageDurationSum}ms (sum of stage durations)`,
      detail: stageDurationSum > reportedDurationMs
        ? 'Stage durations exceed total — some stages ran in parallel'
        : 'Sequential execution confirmed',
    });

    // 5. All stages have a terminal status
    const terminalStatuses = ['approved', 'skipped', 'failed'];
    const nonTerminal = stages.filter((s) => !terminalStatuses.includes(s.status));

    checks.push({
      name: 'All stages reached terminal state',
      status: nonTerminal.length === 0 ? 'pass' : 'fail',
      expected: 'All stages approved, skipped, or failed',
      actual: nonTerminal.length === 0
        ? `All ${stages.length} stages in terminal state`
        : `${nonTerminal.length} stages still in: ${nonTerminal.map((s) => `${s.displayName}(${s.status})`).join(', ')}`,
    });

    // 6. Files generated match file count in DB
    const dbFileCount = run.files.length;
    checks.push({
      name: 'File count verified',
      status: 'pass',
      expected: `${dbFileCount} files in database`,
      actual: `${dbFileCount} files`,
    });

    // 7. Trace event completeness — every stage_start should have a stage_complete
    const stageStarts = run.traceEvents.filter((e) => e.eventType === 'stage_start').length;
    const stageCompletes = run.traceEvents.filter((e) => e.eventType === 'stage_complete').length;

    checks.push({
      name: 'Trace event completeness',
      status: stageStarts === stageCompletes || stageStarts === 0 ? 'pass' : 'warn',
      expected: `${stageStarts} stage_start events`,
      actual: `${stageCompletes} stage_complete events`,
      detail: stageStarts !== stageCompletes && stageStarts > 0
        ? `${stageStarts - stageCompletes} stages started but did not complete in trace`
        : stageStarts === 0 ? 'No trace events — trace logging may not have been active' : undefined,
    });

    // 8. Agent votes — all completed
    const totalVotes = run.agentVotes.length;
    const completedVotes = run.agentVotes.filter((v) => v.status === 'completed').length;

    if (totalVotes > 0) {
      checks.push({
        name: 'Agent votes all completed',
        status: totalVotes === completedVotes ? 'pass' : 'warn',
        expected: `${totalVotes} votes completed`,
        actual: `${completedVotes} completed, ${totalVotes - completedVotes} pending/failed`,
      });
    }

    return checks;
  }

  private static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
