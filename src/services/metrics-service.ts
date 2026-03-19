import { prisma } from '@/src/lib/prisma';
import { type MetricsSummary, type MetricsSummaryItem, type MetricHistoryEntry } from '@/src/types/metrics';

function emptyItem(): MetricsSummaryItem {
  return { totalRuns: 0, successCount: 0, successRate: 0, avgDurationMs: 0, avgFirstPassRate: 0, totalRejections: 0 };
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
      },
    });

    console.log(`[Metrics] Collected metrics for run ${runId}: ${outcome}`);
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

      return {
        totalRuns: items.length,
        successCount,
        successRate: Math.round((successCount / items.length) * 100),
        avgDurationMs: Math.round(totalDurationMs / items.length),
        avgFirstPassRate: totalStages > 0 ? Math.round((totalFirstPass / totalStages) * 100) : 0,
        totalRejections,
      };
    }

    return {
      build: summarize(build),
      diagnostic: summarize(diagnostic),
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
