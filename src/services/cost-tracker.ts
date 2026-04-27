import { prisma } from '@/src/lib/prisma';

const ANTHROPIC_PRICING_SOURCE = 'https://docs.anthropic.com/en/docs/about-claude/pricing';

/**
 * Pricing per 1M tokens. Verified against Anthropic list pricing on 2026-04-27.
 * Cache, batch, long-context, regional endpoint, tax, and reseller markup are not included.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 5.00, output: 25.00 },
  'claude-opus-4-7-20260423': { input: 5.00, output: 25.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-sonnet-4-6-20260217': { input: 3.00, output: 15.00 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-opus-4-1-20250805': { input: 15.00, output: 75.00 },
  'claude-opus-4-6': { input: 5.00, output: 25.00 },
};

export interface PricingDetails {
  inputPerMTok: number;
  outputPerMTok: number;
  source: string;
  note: string;
  billable: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
  backend: 'anthropic' | 'ollama' | 'groq';
}

export interface StageTokenCost {
  input: number;
  output: number;
  cost: number;
  costFormatted: string;
  model: string;
  backend: string;
  pricing: PricingDetails;
}

export class CostTracker {
  static getPricingDetails(model: string, backend: TokenUsage['backend'] = 'anthropic'): PricingDetails {
    if (backend === 'ollama') {
      return {
        inputPerMTok: 0,
        outputPerMTok: 0,
        source: 'local runtime',
        note: 'Local Ollama inference has no API token charge recorded by this app. Hardware and electricity costs are not included.',
        billable: false,
      };
    }

    if (backend === 'groq') {
      return {
        inputPerMTok: 0,
        outputPerMTok: 0,
        source: 'not tracked',
        note: 'Groq provider pricing is not configured in this app, so token spend is reported as untracked rather than free.',
        billable: false,
      };
    }

    const explicit = PRICING[model];
    const pricing = explicit ?? PRICING['claude-sonnet-4-20250514'];
    return {
      inputPerMTok: pricing.input,
      outputPerMTok: pricing.output,
      source: ANTHROPIC_PRICING_SOURCE,
      note: explicit
        ? 'Anthropic list price per million tokens. Cache, batch, long-context, regional endpoint, tax, and reseller markup are not included.'
        : `Unknown Anthropic model "${model}" priced with the Sonnet 4 fallback rate. Cache, batch, long-context, regional endpoint, tax, and reseller markup are not included.`,
      billable: true,
    };
  }

  static calculateCost(usage: TokenUsage): number {
    const pricing = CostTracker.getPricingDetails(usage.model, usage.backend);
    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMTok;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMTok;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }

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
      `(${usage.model}, ${CostTracker.formatCost(cost, usage.backend)})`,
    );
  }

  static async aggregateRunCost(runId: string): Promise<{
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    costFormatted: string;
    pricingSource: string;
    stageTokens: Record<string, StageTokenCost>;
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
        backend: true,
      },
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    const stageTokens: Record<string, StageTokenCost> = {};

    for (const stage of stages) {
      const model = stage.modelUsed || 'unknown';
      const backend = (stage.backend || 'anthropic') as TokenUsage['backend'];

      totalInputTokens += stage.inputTokens;
      totalOutputTokens += stage.outputTokens;
      totalCostUsd += stage.costUsd;

      stageTokens[stage.skillName] = {
        input: stage.inputTokens,
        output: stage.outputTokens,
        cost: stage.costUsd,
        costFormatted: CostTracker.formatCost(stage.costUsd, backend),
        model,
        backend,
        pricing: CostTracker.getPricingDetails(model, backend),
      };
    }

    const roundedTotalCost = Math.round(totalCostUsd * 1_000_000) / 1_000_000;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd: roundedTotalCost,
      costFormatted: CostTracker.formatCost(roundedTotalCost),
      pricingSource: ANTHROPIC_PRICING_SOURCE,
      stageTokens,
    };
  }

  static formatCost(costUsd: number, backend?: string): string {
    if (costUsd === 0 && backend === 'ollama') return 'Free (local)';
    if (costUsd === 0 && backend === 'groq') return 'Not tracked';
    if (costUsd === 0) return '$0.0000';
    if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
    if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
    return `$${costUsd.toFixed(2)}`;
  }

  static formatTokens(count: number): string {
    if (count < 1000) return String(count);
    if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
}
