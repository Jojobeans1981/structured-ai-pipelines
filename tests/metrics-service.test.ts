/**
 * Unit tests for MetricsService.
 *
 * Validates: summary computation (build pass rate, worked out of box,
 * auto-fix rate, cost, LLM time), history retrieval, and prompt health stats.
 * Prisma is fully mocked — no database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/src/lib/prisma', () => import('./__mocks__/prisma'));

vi.mock('@/src/services/cost-tracker', () => ({
  CostTracker: {
    aggregateRunCost: vi.fn().mockResolvedValue({
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCostUsd: 0.05,
      stageTokens: {},
    }),
    formatTokens: vi.fn((n: number) => `${n}`),
    formatCost: vi.fn((n: number) => `$${n.toFixed(2)}`),
  },
}));

import { MetricsService } from '@/src/services/metrics-service';
import { prisma } from './__mocks__/prisma';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getMetricsHistory
// ---------------------------------------------------------------------------
describe('MetricsService.getMetricsHistory', () => {
  it('returns formatted history entries with project name', async () => {
    prisma.pipelineMetric.findMany.mockResolvedValue([
      {
        id: 'm1', pipelineType: 'build', totalDurationMs: 12000,
        stageCount: 4, approvedFirstPass: 3, rejectionCount: 1,
        outcome: 'success', stageDurations: { 'prd-architect': 5000, 'phase-builder': 7000 },
        createdAt: new Date('2026-03-20T10:00:00Z'), runId: 'run-1',
        project: { name: 'my-project' },
      },
    ]);

    const history = await MetricsService.getMetricsHistory('user-1', 'build', 20);

    expect(history).toHaveLength(1);
    expect(history[0].projectName).toBe('my-project');
    expect(history[0].stageDurations).toEqual({ 'prd-architect': 5000, 'phase-builder': 7000 });
    expect(history[0].outcome).toBe('success');
  });

  it('passes type filter and limit to Prisma', async () => {
    prisma.pipelineMetric.findMany.mockResolvedValue([]);

    await MetricsService.getMetricsHistory('user-1', 'diagnostic', 5);

    expect(prisma.pipelineMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', pipelineType: 'diagnostic' },
        take: 5,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// getPromptHealth
// ---------------------------------------------------------------------------
describe('MetricsService.getPromptHealth', () => {
  it('computes pass rate and avg confidence from scores', async () => {
    prisma.confidenceScore.findMany.mockResolvedValue([
      { score: 0.95, passed: true, attempt: 1, createdAt: new Date('2026-03-20') },
      { score: 0.40, passed: false, attempt: 1, createdAt: new Date('2026-03-19') },
      { score: 0.80, passed: true, attempt: 2, createdAt: new Date('2026-03-18') },
    ]);

    const health = await MetricsService.getPromptHealth();

    expect(health.totalEvaluations).toBe(3);
    expect(health.passRate).toBe(67);
    expect(health.avgConfidence).toBe(72);
    expect(health.totalRetries).toBe(1);
    expect(health.recentScores).toHaveLength(3);
  });

  it('returns zeros when no scores exist', async () => {
    prisma.confidenceScore.findMany.mockResolvedValue([]);

    const health = await MetricsService.getPromptHealth();

    expect(health.totalEvaluations).toBe(0);
    expect(health.passRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getAgentBreakdown
// ---------------------------------------------------------------------------
describe('MetricsService.getAgentBreakdown', () => {
  it('scopes guardian and socratic event counts to the authenticated user', async () => {
    prisma.learningEntry.groupBy.mockResolvedValue([]);
    prisma.pipelineStage.groupBy.mockResolvedValue([]);
    prisma.confidenceScore.findMany.mockResolvedValue([]);
    prisma.traceEvent.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    const breakdown = await MetricsService.getAgentBreakdown('user-1');

    expect(prisma.traceEvent.count).toHaveBeenNthCalledWith(1, {
      where: { source: 'guardian', run: { project: { userId: 'user-1' } } },
    });
    expect(prisma.traceEvent.count).toHaveBeenNthCalledWith(2, {
      where: { source: 'guardian', eventType: 'gate_rejected', run: { project: { userId: 'user-1' } } },
    });
    expect(prisma.traceEvent.count).toHaveBeenNthCalledWith(3, {
      where: { source: 'socratic', run: { project: { userId: 'user-1' } } },
    });

    expect(breakdown.guardianStats).toEqual({
      totalChecks: 10,
      driftDetected: 3,
      passRate: 70,
    });
    expect(breakdown.socraticStats).toEqual({
      interventions: 4,
      autoResolved: 4,
    });
  });
});

// ---------------------------------------------------------------------------
// collectMetrics
// ---------------------------------------------------------------------------
describe('MetricsService.collectMetrics', () => {
  it('creates a metric record from a completed run', async () => {
    const startedAt = new Date('2026-03-20T10:00:00Z');
    const completedAt = new Date('2026-03-20T10:05:00Z');

    prisma.pipelineRun.findUnique.mockResolvedValue({
      id: 'run-1',
      status: 'completed',
      type: 'build',
      projectId: 'proj-1',
      startedAt,
      completedAt,
      project: { userId: 'user-1' },
      stages: [
        { skillName: 'prd-architect', status: 'approved', durationMs: 120000, userFeedback: null },
        { skillName: 'phase-builder', status: 'approved', durationMs: 60000, userFeedback: 'revise this' },
        { skillName: 'prompt-builder', status: 'approved', durationMs: 90000, userFeedback: null },
      ],
    });
    prisma.pipelineMetric.create.mockResolvedValue({});

    await MetricsService.collectMetrics('run-1');

    expect(prisma.pipelineMetric.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: 'run-1',
        outcome: 'success',
        stageCount: 3,
        approvedFirstPass: 2,
        rejectionCount: 1,
      }),
    });
  });

  it('does nothing when run is not found', async () => {
    prisma.pipelineRun.findUnique.mockResolvedValue(null);

    await MetricsService.collectMetrics('nonexistent');

    expect(prisma.pipelineMetric.create).not.toHaveBeenCalled();
  });
});
