import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { CostGuard } from '@/src/services/cost-guard';
import { CostTracker } from '@/src/services/cost-tracker';

export const dynamic = 'force-dynamic';

interface Props {
  params: { runId: string };
}

/**
 * GET /api/pipeline/[runId]/estimate — Get cost estimate and budget status for a run.
 */
export async function GET(_request: Request, { params }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: {
      project: { select: { userId: true } },
      stages: { select: { id: true, nodeType: true, status: true, costUsd: true } },
    },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Current spend
  const currentCost = await CostTracker.aggregateRunCost(params.runId);

  // Estimate remaining cost
  const remainingNodes = run.stages.filter(
    (s) => s.status === 'pending' || s.status === 'running'
  ).length;
  const estimate = CostGuard.estimateRunCost(remainingNodes);

  // Budget status
  const budgetCheck = await CostGuard.checkBudget(params.runId, user.id);
  const budgets = CostGuard.getBudgets();

  return NextResponse.json({
    currentCost: {
      totalUsd: currentCost.totalCostUsd,
      formatted: CostTracker.formatCost(currentCost.totalCostUsd),
      inputTokens: currentCost.totalInputTokens,
      outputTokens: currentCost.totalOutputTokens,
      breakdown: currentCost.stageTokens,
    },
    estimate: {
      remainingNodes,
      estimatedRemainingUsd: estimate.estimatedCostUsd,
      breakdown: estimate.breakdown,
      projectedTotalUsd: currentCost.totalCostUsd + estimate.estimatedCostUsd,
    },
    budget: {
      runBudget: budgets.runBudget,
      dailyBudget: budgets.dailyBudget,
      runSpent: budgetCheck.currentRunCost,
      dailySpent: budgetCheck.dailyCost,
      withinBudget: budgetCheck.allowed,
      reason: budgetCheck.reason,
    },
    stages: {
      total: run.stages.length,
      completed: run.stages.filter((s) => s.status === 'approved').length,
      pending: run.stages.filter((s) => s.status === 'pending').length,
      running: run.stages.filter((s) => s.status === 'running').length,
    },
  });
}
