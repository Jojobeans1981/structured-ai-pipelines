import { prisma } from '@/src/lib/prisma';
import { CostTracker } from '@/src/services/cost-tracker';

/** Default budget per run in USD. Override with FORGE_RUN_BUDGET_USD env var. */
const DEFAULT_RUN_BUDGET = parseFloat(process.env.FORGE_RUN_BUDGET_USD || '5.00');

/** Default budget per user per day in USD. Override with FORGE_DAILY_BUDGET_USD. */
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
  /**
   * Check whether a pipeline run is within budget before executing the next node.
   * Returns { allowed: false, reason } if budget exceeded.
   */
  static async checkBudget(
    runId: string,
    userId: string
  ): Promise<BudgetCheck> {
    const runBudget = DEFAULT_RUN_BUDGET;
    const dailyBudget = DEFAULT_DAILY_BUDGET;

    // 1. Get current run cost
    const runCost = await CostTracker.aggregateRunCost(runId);
    const currentRunCost = runCost.totalCostUsd;

    // 2. Estimate next stage cost (based on average of completed stages)
    const completedStages = await prisma.pipelineStage.findMany({
      where: { runId, status: 'approved' },
      select: { costUsd: true },
    });
    const avgStageCost = completedStages.length > 0
      ? completedStages.reduce((sum, s) => sum + s.costUsd, 0) / completedStages.length
      : 0.05; // default estimate: $0.05 per stage

    const estimatedNextCost = avgStageCost;
    const projectedTotal = currentRunCost + estimatedNextCost;

    // 3. Check run budget
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

    // 4. Check daily user budget
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

  /**
   * Estimate the total cost of a run before starting, based on node count and types.
   * Useful for "dry run" cost preview.
   */
  static estimateRunCost(nodeCount: number, model: string = 'claude-sonnet-4-20250514'): {
    estimatedCostUsd: number;
    breakdown: string;
    withinBudget: boolean;
  } {
    // Average tokens per stage type (empirical estimates)
    const AVG_INPUT_TOKENS = 4000;
    const AVG_OUTPUT_TOKENS = 6000;

    const perStageCost = CostTracker.calculateCost({
      inputTokens: AVG_INPUT_TOKENS,
      outputTokens: AVG_OUTPUT_TOKENS,
      model,
      backend: 'anthropic',
    });

    // LLM nodes are roughly 70% of total nodes (rest are gates, verify)
    const llmNodes = Math.ceil(nodeCount * 0.7);
    const estimatedCostUsd = llmNodes * perStageCost;

    return {
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
      breakdown: `~${llmNodes} LLM calls × ~${AVG_INPUT_TOKENS + AVG_OUTPUT_TOKENS} tokens × $${perStageCost.toFixed(4)}/call`,
      withinBudget: estimatedCostUsd <= DEFAULT_RUN_BUDGET,
    };
  }

  /**
   * Get budget configuration for display.
   */
  static getBudgets(): { runBudget: number; dailyBudget: number } {
    return { runBudget: DEFAULT_RUN_BUDGET, dailyBudget: DEFAULT_DAILY_BUDGET };
  }
}
