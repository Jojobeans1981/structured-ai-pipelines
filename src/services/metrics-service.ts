import { prisma } from '@/src/lib/prisma';
import { type MetricsSummary, type MetricsSummaryItem, type MetricHistoryEntry } from '@/src/types/metrics';
import { CostTracker } from '@/src/services/cost-tracker';

function emptyItem(): MetricsSummaryItem {
  return {
    totalRuns: 0,
    buildPassRate: 0,
    workedOutOfBoxRate: 0,
    autoFixRate: 0,
    avgAutoFixCycles: 0,
    totalCostUsd: 0,
    avgCostPerRun: 0,
    avgLlmTimeMs: 0,
    totalRejections: 0,
    feedbackCount: 0,
  };
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
      `[Metrics] Run ${runId}: ${outcome}, ` +
      `cost: ${CostTracker.formatCost(tokenData.totalCostUsd)}`
    );
  }

  static async getMetricsSummary(userId: string): Promise<MetricsSummary> {
    const metrics = await prisma.pipelineMetric.findMany({
      where: { userId },
    });

    const build = metrics.filter((m) => m.pipelineType === 'build');
    const diagnostic = metrics.filter((m) => m.pipelineType === 'diagnostic');

    // Get feedback data for this user
    const feedback = await prisma.projectFeedback.findMany({
      where: { userId },
    });

    // Get verify stage retry counts to calculate auto-fix rate
    const verifyStages = await prisma.pipelineStage.findMany({
      where: {
        run: { project: { userId } },
        nodeType: 'verify',
      },
      select: { runId: true, retryCount: true, status: true },
    });

    // Get LLM-only durations (stages that actually ran LLM, not gates/verify)
    const llmStages = await prisma.pipelineStage.findMany({
      where: {
        run: { project: { userId } },
        nodeType: 'skill',
        durationMs: { not: null },
      },
      select: { runId: true, durationMs: true, run: { select: { type: true } } },
    });

    return {
      build: MetricsService.summarize(build, feedback, verifyStages, llmStages, 'build'),
      diagnostic: MetricsService.summarize(diagnostic, feedback, verifyStages, llmStages, 'diagnostic'),
    };
  }

  private static summarize(
    metrics: Array<{
      id: string; runId: string; outcome: string;
      totalDurationMs: number; stageCount: number;
      approvedFirstPass: number; rejectionCount: number;
      totalCostUsd: number; pipelineType: string;
    }>,
    feedback: Array<{ runId: string | null; rating: number; workedOutOfBox: boolean }>,
    verifyStages: Array<{ runId: string; retryCount: number; status: string }>,
    llmStages: Array<{ runId: string; durationMs: number | null; run: { type: string } }>,
    type: string
  ): MetricsSummaryItem {
    const items = metrics.filter((m) => m.pipelineType === type);
    if (items.length === 0) return emptyItem();

    const runIds = new Set(items.map((m) => m.runId));

    // Build pass rate: runs where verify node passed without retries
    const relevantVerify = verifyStages.filter((v) => runIds.has(v.runId));
    const verifyPassed = relevantVerify.filter((v) => v.retryCount === 0 && v.status === 'approved').length;
    const buildPassRate = relevantVerify.length > 0
      ? Math.round((verifyPassed / relevantVerify.length) * 100) : 0;

    // Auto-fix rate: runs where verify needed retries
    const verifyRetried = relevantVerify.filter((v) => v.retryCount > 0);
    const autoFixRate = relevantVerify.length > 0
      ? Math.round((verifyRetried.length / relevantVerify.length) * 100) : 0;
    const avgAutoFixCycles = verifyRetried.length > 0
      ? Math.round((verifyRetried.reduce((s, v) => s + v.retryCount, 0) / verifyRetried.length) * 10) / 10 : 0;

    // Worked out of box rate: from user feedback
    const relevantFeedback = feedback.filter((f) => f.runId && runIds.has(f.runId));
    const workedCount = relevantFeedback.filter((f) => f.workedOutOfBox).length;
    const workedOutOfBoxRate = relevantFeedback.length > 0
      ? Math.round((workedCount / relevantFeedback.length) * 100) : 0;

    // Cost
    const totalCostUsd = items.reduce((sum, m) => sum + m.totalCostUsd, 0);
    const avgCostPerRun = Math.round((totalCostUsd / items.length) * 10000) / 10000;

    // LLM time (excludes human wait, gates, verify)
    const relevantLlm = llmStages.filter((s) => runIds.has(s.runId) && s.run.type === type);
    const totalLlmMs = relevantLlm.reduce((sum, s) => sum + (s.durationMs || 0), 0);
    const llmRunCount = new Set(relevantLlm.map((s) => s.runId)).size;
    const avgLlmTimeMs = llmRunCount > 0 ? Math.round(totalLlmMs / llmRunCount) : 0;

    // Rejections
    const totalRejections = items.reduce((sum, m) => sum + m.rejectionCount, 0);

    return {
      totalRuns: items.length,
      buildPassRate,
      workedOutOfBoxRate,
      autoFixRate,
      avgAutoFixCycles,
      totalCostUsd: Math.round(totalCostUsd * 100) / 100,
      avgCostPerRun,
      avgLlmTimeMs,
      totalRejections,
      feedbackCount: relevantFeedback.length,
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

  /**
   * Get per-agent breakdown: which agents cause the most rejections,
   * confidence score trends, and cost per agent.
   */
  static async getAgentBreakdown(userId: string): Promise<{
    agentRejections: Array<{ agent: string; rejections: number; source: string }>;
    agentCosts: Array<{ agent: string; totalCost: number; avgCost: number; runs: number }>;
    confidenceTrend: Array<{ date: string; avgScore: number; count: number }>;
    guardianStats: { totalChecks: number; driftDetected: number; passRate: number };
    socraticStats: { interventions: number; autoResolved: number };
  }> {
    // Agent rejections from learning store
    const rejectionAgg = await prisma.learningEntry.groupBy({
      by: ['targetAgent', 'sourceAgent'],
      _sum: { rejectionCount: true },
      orderBy: { _sum: { rejectionCount: 'desc' } },
      take: 20,
    });

    const agentRejections = rejectionAgg.map((r) => ({
      agent: r.targetAgent,
      rejections: r._sum.rejectionCount || 0,
      source: r.sourceAgent,
    }));

    // Agent costs from pipeline stages
    const costAgg = await prisma.pipelineStage.groupBy({
      by: ['skillName'],
      where: { run: { project: { userId } }, costUsd: { gt: 0 } },
      _sum: { costUsd: true },
      _avg: { costUsd: true },
      _count: { _all: true },
      orderBy: { _sum: { costUsd: 'desc' } },
      take: 15,
    });

    const agentCosts = costAgg.map((c) => ({
      agent: c.skillName,
      totalCost: Math.round((c._sum?.costUsd || 0) * 10000) / 10000,
      avgCost: Math.round((c._avg?.costUsd || 0) * 10000) / 10000,
      runs: c._count?._all || 0,
    }));

    // Confidence score trends (grouped by day)
    const scores = await prisma.confidenceScore.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { score: true, createdAt: true },
    });

    const byDay = new Map<string, { total: number; count: number }>();
    for (const s of scores) {
      const day = s.createdAt.toISOString().split('T')[0];
      const existing = byDay.get(day) || { total: 0, count: 0 };
      existing.total += s.score;
      existing.count += 1;
      byDay.set(day, existing);
    }

    const confidenceTrend = Array.from(byDay.entries())
      .map(([date, { total, count }]) => ({
        date,
        avgScore: Math.round((total / count) * 100),
        count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Guardian stats from trace events
    const guardianEvents = await prisma.traceEvent.count({
      where: { source: 'guardian' },
    });
    const guardianDrift = await prisma.traceEvent.count({
      where: { source: 'guardian', eventType: 'gate_rejected' },
    });

    const guardianStats = {
      totalChecks: guardianEvents,
      driftDetected: guardianDrift,
      passRate: guardianEvents > 0 ? Math.round(((guardianEvents - guardianDrift) / guardianEvents) * 100) : 100,
    };

    // Socratic stats
    const socraticEvents = await prisma.traceEvent.count({
      where: { source: 'socratic' },
    });

    const socraticStats = {
      interventions: socraticEvents,
      autoResolved: socraticEvents, // All auto-resolved for now (no human answer flow yet)
    };

    return { agentRejections, agentCosts, confidenceTrend, guardianStats, socraticStats };
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
