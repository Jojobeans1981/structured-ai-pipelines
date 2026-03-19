import { prisma } from '@/src/lib/prisma';

/**
 * Pricing per 1M tokens (as of March 2026)
 * Source: https://docs.anthropic.com/en/docs/about-claude/pricing
 */
const PRICING: Record<string, { input: number; output: number }> = {
  // Claude models — cost per 1M tokens
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-opus-4-6': { input: 15.00, output: 75.00 },
  // Ollama — free (local)
  'llama3.1:8b': { input: 0, output: 0 },
  'phi3:mini': { input: 0, output: 0 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  backend: 'anthropic' | 'ollama';
}

export class CostTracker {
  /**
   * Calculate USD cost for a given token usage.
   */
  static calculateCost(usage: TokenUsage): number {
    const pricing = PRICING[usage.model] || PRICING['claude-sonnet-4-20250514'];
    const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
  }

  /**
   * Record token usage for a pipeline stage.
   */
  static async recordStageUsage(stageId: string, usage: TokenUsage): Promise<void> {
    const cost = CostTracker.calculateCost(usage);

    await prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        modelUsed: usage.model,
        backend: usage.backend,
        costUsd: cost,
      },
    });

    console.log(
      `[CostTracker] Stage ${stageId}: ${usage.inputTokens} in / ${usage.outputTokens} out ` +
      `(${usage.model}, $${cost.toFixed(6)})`
    );
  }

  /**
   * Aggregate token usage across all stages of a run.
   */
  static async aggregateRunCost(runId: string): Promise<{
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    stageTokens: Record<string, { input: number; output: number; cost: number; model: string }>;
  }> {
    const stages = await prisma.pipelineStage.findMany({
      where: { runId },
      select: {
        skillName: true,
        displayName: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        modelUsed: true,
      },
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    const stageTokens: Record<string, { input: number; output: number; cost: number; model: string }> = {};

    for (const stage of stages) {
      totalInputTokens += stage.inputTokens;
      totalOutputTokens += stage.outputTokens;
      totalCostUsd += stage.costUsd;

      stageTokens[stage.skillName] = {
        input: stage.inputTokens,
        output: stage.outputTokens,
        cost: stage.costUsd,
        model: stage.modelUsed || 'unknown',
      };
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      stageTokens,
    };
  }

  /**
   * Format cost for display.
   */
  static formatCost(costUsd: number): string {
    if (costUsd === 0) return 'Free (local)';
    if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
    if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
    return `$${costUsd.toFixed(2)}`;
  }

  /**
   * Format token count for display.
   */
  static formatTokens(count: number): string {
    if (count < 1000) return String(count);
    if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
}
