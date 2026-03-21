import { prisma } from '@/src/lib/prisma';
import { type MetricsSummary, type MetricsSummaryItem, type MetricHistoryEntry } from '@/src/types/metrics';
import { CostTracker } from '@/src/services/cost-tracker';

function emptyItem(): MetricsSummaryItem {
  return { totalRuns: 0, successCount: 0, successRate: 0, avgDurationMs: 0, avgFirstPassRate: 0, totalRejections: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0 };
}

export class MetricsService {
  static async collectMetrics(runId: string): Promise<void> {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        stages: true,
        project: { select: { userId: true } },
      },
    });

    if (!run) return;

    const totalDurationMs = run.completedAt && run.startedAt
      ? run.completedAt.getTime() - run.startedAt.getTime()
      : 0;

    const stageCount = run.stages.length;
    const approvedStages = run.stages.filter((s) => s.status === 'approved');
    const approvedFirstPass = approvedStages.filter((s) => !s.userFeedback).length;
    const rejectionCount = run.stages.filter((s) => s.userFeedback).length;

    const outcome = run.status === 'completed' ? 'success'
      : run.status === 'cancelled' ? 'cancelled'
      : 'failure';

    const stageDurations: Record<string, number> = {};
    for (const stage of run.stages) {
      if (stage.durationMs) {
        stageDurations[stage.skillName] = stage.durationMs;
      }
    }

    // Aggregate token usage
    const tokenData = await CostTracker.aggregateRunCost(runId);

    await prisma.pipelineMetric.create({
      data: {
        runId,
        projectId: run.projectId,
        userId: run.project.userId,
        pipelineType: run.type,
        totalDurationMs,
        stageCount,
        approvedFirstPass,
        rejectionCount,
        outcome,
        stageDurations,
        totalInputTokens: tokenData.totalInputTokens,
        totalOutputTokens: tokenData.totalOutputTokens,
        totalCostUsd: tokenData.totalCostUsd,
        stageTokens: tokenData.stageTokens,
      },
    });

    console.log(
      `[Metrics] Collected metrics for run ${runId}: ${outcome}, ` +
      `${CostTracker.formatTokens(tokenData.totalInputTokens)} in / ` +
      `${CostTracker.formatTokens(tokenData.totalOutputTokens)} out, ` +
      `cost: ${CostTracker.formatCost(tokenData.totalCostUsd)}`
    );
  }

  static async getMetricsSummary(userId: string): Promise<MetricsSummary> {
    const metrics = await prisma.pipelineMetric.findMany({
      where: { userId },
    });

    const build = metrics.filter((m) => m.pipelineType === 'build');
    const diagnostic = metrics.filter((m) => m.pipelineType === 'diagnostic');

    function summarize(items: typeof metrics): MetricsSummaryItem {
      if (items.length === 0) return emptyItem();

      const successCount = items.filter((m) => m.outcome === 'success').length;
      const totalDurationMs = items.reduce((sum, m) => sum + m.totalDurationMs, 0);
      const totalFirstPass = items.reduce((sum, m) => sum + m.approvedFirstPass, 0);
      const totalStages = items.reduce((sum, m) => sum + m.stageCount, 0);
      const totalRejections = items.reduce((sum, m) => sum + m.rejectionCount, 0);

      const totalInputTokens = items.reduce((sum, m) => sum + m.totalInputTokens, 0);
      const totalOutputTokens = items.reduce((sum, m) => sum + m.totalOutputTokens, 0);
      const totalCostUsd = items.reduce((sum, m) => sum + m.totalCostUsd, 0);

      return {
        totalRuns: items.length,
        successCount,
        successRate: Math.round((successCount / items.length) * 100),
        avgDurationMs: Math.round(totalDurationMs / items.length),
        avgFirstPassRate: totalStages > 0 ? Math.round((totalFirstPass / totalStages) * 100) : 0,
        totalRejections,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd,
      };
    }

    return {
      build: summarize(build),
      diagnostic: summarize(diagnostic),
    };
  }

  static async getPromptHealth(): Promise<{
    totalEvaluations: number;
    passRate: number;
    avgConfidence: number;
    totalRetries: number;
    recentScores: Array<{ score: number; passed: boolean; createdAt: string }>;
  }> {
    const scores = await prisma.confidenceScore.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (scores.length === 0) {
      return { totalEvaluations: 0, passRate: 0, avgConfidence: 0, totalRetries: 0, recentScores: [] };
    }

    const passed = scores.filter((s) => s.passed).length;
    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const retries = scores.filter((s) => s.attempt > 1).length;

    return {
      totalEvaluations: scores.length,
      passRate: Math.round((passed / scores.length) * 100),
      avgConfidence: Math.round(avgScore * 100),
      totalRetries: retries,
      recentScores: scores.slice(0, 10).map((s) => ({
        score: s.score,
        passed: s.passed,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }

  static async getMetricsHistory(
    userId: string,
    type?: string,
    limit: number = 20
  ): Promise<MetricHistoryEntry[]> {
    const where: Record<string, unknown> = { userId };
    if (type) where.pipelineType = type;

    const metrics = await prisma.pipelineMetric.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        project: { select: { name: true } },
      },
    });

    return metrics.map((m) => ({
      id: m.id,
      pipelineType: m.pipelineType,
      totalDurationMs: m.totalDurationMs,
      stageCount: m.stageCount,
      approvedFirstPass: m.approvedFirstPass,
      rejectionCount: m.rejectionCount,
      outcome: m.outcome,
      stageDurations: m.stageDurations as Record<string, number>,
      createdAt: m.createdAt.toISOString(),
      projectName: m.project.name,
      runId: m.runId,
    }));
  }
}
