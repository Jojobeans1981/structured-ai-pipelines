import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/src/lib/prisma', () => import('./__mocks__/prisma'))

import { CostTracker } from '../src/services/cost-tracker'
import { prisma } from './__mocks__/prisma'

describe('CostTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calculates Anthropic list-price cost from exact token usage', () => {
    expect(CostTracker.calculateCost({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: 'claude-haiku-4-5-20251001',
      backend: 'anthropic',
    })).toBe(6)

    expect(CostTracker.getPricingDetails('claude-haiku-4-5-20251001').inputPerMTok).toBe(1)
    expect(CostTracker.getPricingDetails('claude-haiku-4-5-20251001').outputPerMTok).toBe(5)
    expect(CostTracker.getPricingDetails('claude-opus-4-7').inputPerMTok).toBe(5)
    expect(CostTracker.getPricingDetails('claude-opus-4-7').outputPerMTok).toBe(25)
  })

  it('labels local and untracked providers distinctly from billable Anthropic cost', () => {
    expect(CostTracker.calculateCost({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: 'llama3.1:8b',
      backend: 'ollama',
    })).toBe(0)
    expect(CostTracker.formatCost(0, 'ollama')).toBe('Free (local)')
    expect(CostTracker.formatCost(0, 'groq')).toBe('Not tracked')
  })

  it('aggregates per-stage cost with pricing metadata', async () => {
    prisma.pipelineStage.findMany.mockResolvedValue([
      {
        skillName: 'executor',
        displayName: 'Executor',
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.0105,
        modelUsed: 'claude-sonnet-4-20250514',
        backend: 'anthropic',
      },
    ])

    const cost = await CostTracker.aggregateRunCost('run-1')

    expect(cost.totalInputTokens).toBe(1000)
    expect(cost.totalOutputTokens).toBe(500)
    expect(cost.costFormatted).toBe('$0.011')
    expect(cost.stageTokens.executor.pricing.inputPerMTok).toBe(3)
    expect(cost.stageTokens.executor.pricing.outputPerMTok).toBe(15)
    expect(cost.stageTokens.executor.pricing.source).toContain('anthropic')
  })
})
