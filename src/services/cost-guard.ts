import { prisma } from '@/src/lib/prisma';
import { CostTracker } from '@/src/services/cost-tracker';

const DEFAULT_RUN_BUDGET = parseFloat(process.env.FORGE_RUN_BUDGET_USD || '5.00');
const DEFAULT_DAILY_BUDGET = parseFloat(process.env.FORGE_DAILY_BUDGET_USD || '20.00');

export interface BudgetCheck {
  allowed: boolean;
  reason: string;
  currentRunCost: number;
  runBudget: number;
  dailyCost: number;
  dailyBudget: number;
  estimatedNextCost: number;
}

export class CostGuard {
  static async checkBudget(runId: string, userId: string): Promise<BudgetCheck> {
    const runBudget = DEFAULT_RUN_BUDGET;
    const dailyBudget = DEFAULT_DAILY_BUDGET;

    const runCost = await CostTracker.aggregateRunCost(runId);
    const currentRunCost = runCost.totalCostUsd;

    const completedStages = await prisma.pipelineStage.findMany({
      where: { runId, status: 'approved' },
      select: { costUsd: true },
    });
    const avgStageCost = completedStages.length > 0
      ? completedStages.reduce((sum, s) => sum + s.costUsd, 0) / completedStages.length
      : 0.05;

    const estimatedNextCost = avgStageCost;
    const projectedTotal = currentRunCost + estimatedNextCost;

    if (projectedTotal > runBudget) {
      return {
        allowed: false,
        reason: `Run budget exceeded: current $${currentRunCost.toFixed(4)} + estimated $${estimatedNextCost.toFixed(4)} = $${projectedTotal.toFixed(4)} > $${runBudget.toFixed(2)} limit. Set FORGE_RUN_BUDGET_USD to increase.`,
        currentRunCost,
        runBudget,
        dailyCost: 0,
        dailyBudget,
        estimatedNextCost,
      };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const dailyMetrics = await prisma.pipelineMetric.aggregate({
      where: {
        userId,
        createdAt: { gte: startOfDay },
      },
      _sum: { totalCostUsd: true },
    });

    const dailyCost = (dailyMetrics._sum.totalCostUsd || 0) + currentRunCost;

    if (dailyCost + estimatedNextCost > dailyBudget) {
      return {
        allowed: false,
        reason: `Daily budget exceeded: $${dailyCost.toFixed(4)} spent today + estimated $${estimatedNextCost.toFixed(4)} > $${dailyBudget.toFixed(2)} daily limit. Set FORGE_DAILY_BUDGET_USD to increase.`,
        currentRunCost,
        runBudget,
        dailyCost,
        dailyBudget,
        estimatedNextCost,
      };
    }

    return {
      allowed: true,
      reason: `Within budget: run $${currentRunCost.toFixed(4)}/$${runBudget.toFixed(2)}, daily $${dailyCost.toFixed(4)}/$${dailyBudget.toFixed(2)}`,
      currentRunCost,
      runBudget,
      dailyCost,
      dailyBudget,
      estimatedNextCost,
    };
  }

  static estimateRunCost(nodeCount: number, model: string = 'claude-sonnet-4-20250514'): {
    estimatedCostUsd: number;
    breakdown: string;
    withinBudget: boolean;
  } {
    const avgInputTokens = 4000;
    const avgOutputTokens = 6000;

    const perStageCost = CostTracker.calculateCost({
      inputTokens: avgInputTokens,
      outputTokens: avgOutputTokens,
      model,
      backend: 'anthropic',
    });

    const llmNodes = Math.ceil(nodeCount * 0.7);
    const estimatedCostUsd = llmNodes * perStageCost;

    return {
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
      breakdown: `~${llmNodes} LLM calls x ~${avgInputTokens + avgOutputTokens} tokens x ${CostTracker.formatCost(perStageCost)}/call`,
      withinBudget: estimatedCostUsd <= DEFAULT_RUN_BUDGET,
    };
  }

  static getBudgets(): { runBudget: number; dailyBudget: number } {
    return { runBudget: DEFAULT_RUN_BUDGET, dailyBudget: DEFAULT_DAILY_BUDGET };
  }
}
