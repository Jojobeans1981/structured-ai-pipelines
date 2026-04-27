import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { createWithFallback } from '@/src/lib/anthropic';
import { TraceLogger } from '@/src/services/trace-logger';
import { DecisionOption, DecisionResult } from '@/src/services/decision-agent';
import { SkillLoader } from '@/src/services/skill-loader';
import { CostTracker } from '@/src/services/cost-tracker';

interface AgentSpec {
  role: string;
  label: string;
  skillName: string;
  weight: number; // vote weight — security gets 1.5x on security-related decisions
}

interface AgentResult {
  role: string;
  votedOption: string;
  confidence: number;
  reasoning: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  status: 'fulfilled' | 'rejected';
  error?: string;
}

export interface CoordinatorResult {
  chosenOption: string;
  chosenReason: string;
  voteSummary: Record<string, { votes: number; weightedScore: number; voters: string[] }>;
  agentResults: AgentResult[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  wallClockMs: number; // parallel execution time
}

const DEFAULT_AGENTS: AgentSpec[] = [
  {
    role: 'architecture',
    label: 'Architecture Analyst',
    skillName: 'analysis-architecture',
    weight: 1.0,
  },
  {
    role: 'code_quality',
    label: 'Code Quality Analyst',
    skillName: 'analysis-code-quality',
    weight: 1.0,
  },
  {
    role: 'security',
    label: 'Security Analyst',
    skillName: 'analysis-security',
    weight: 1.5,
  },
  {
    role: 'performance',
    label: 'Performance Analyst',
    skillName: 'analysis-performance',
    weight: 1.0,
  },
  {
    role: 'ux',
    label: 'UX Analyst',
    skillName: 'analysis-ux',
    weight: 0.8,
  },
];

export class AgentCoordinator {
  /**
   * Spawn concurrent analysis agents that each vote on a decision.
   * Uses Promise.allSettled so one agent failure doesn't block others.
   */
  static async concurrentDecide(
    runId: string,
    stageId: string,
    traceId: string,
    parentSpanId: string,
    decisionPrompt: string,
    options: DecisionOption[],
    client: Anthropic,
    agentRoles?: string[]
  ): Promise<CoordinatorResult> {
    const startTime = Date.now();

    // Filter agents if specific roles requested
    const agents = agentRoles
      ? DEFAULT_AGENTS.filter((a) => agentRoles.includes(a.role))
      : DEFAULT_AGENTS;

    // Log decision start
    const decisionSpanId = await TraceLogger.decisionStart(
      runId, traceId, parentSpanId,
      decisionPrompt, options.length
    );

    // Build shared context
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        stages: {
          where: { status: 'approved' },
          orderBy: { stageIndex: 'asc' },
        },
      },
    });

    if (!run) throw new Error(`Run not found: ${runId}`);

    const contextParts = [`## User Input\n${run.userInput}`];
    for (const stage of run.stages) {
      if (stage.artifactContent) {
        contextParts.push(`## ${stage.displayName}\n${stage.artifactContent.substring(0, 1500)}`);
      }
    }

    const optionsText = options.map((o) =>
      `- **${o.id}**: ${o.label} — ${o.description}`
    ).join('\n');

    const sharedContext = `${contextParts.join('\n\n')}\n\n## Decision Required\n${decisionPrompt}\n\n## Options\n${optionsText}`;

    // Spawn all agents in parallel
    const promises = agents.map((spec) =>
      this.runAgent(spec, sharedContext, options, client, runId, stageId, traceId, decisionSpanId)
    );

    const settled = await Promise.allSettled(promises);

    // Collect results
    const agentResults: AgentResult[] = settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        role: agents[i].role,
        votedOption: '',
        confidence: 0,
        reasoning: `Agent failed: ${result.reason?.message ?? 'unknown error'}`,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs: 0,
        status: 'rejected' as const,
        error: result.reason?.message,
      };
    });

    // Only count successful votes
    const successfulVotes = agentResults.filter((r) => r.status === 'fulfilled' && r.votedOption);

    // Tally votes
    const { chosenOption, chosenReason, voteSummary } = this.tallyVotes(successfulVotes, agents, options);

    // Persist agent votes to DB
    for (const result of agentResults) {
      const agentSpanId = TraceLogger.generateSpanId();
      prisma.agentVote.create({
        data: {
          runId,
          stageId,
          spanId: agentSpanId,
          agentRole: result.role,
          votedOption: result.votedOption || 'none',
          confidence: result.confidence,
          reasoning: result.reasoning,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          durationMs: result.durationMs,
          status: result.status === 'fulfilled' ? 'completed' : 'failed',
        },
      }).catch((err) => console.error(`[AgentCoordinator] Failed to persist vote: ${err.message}`));
    }

    const wallClockMs = Date.now() - startTime;
    const totalInputTokens = agentResults.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = agentResults.reduce((sum, r) => sum + r.outputTokens, 0);
    const totalCostUsd = agentResults.reduce((sum, r) => sum + r.costUsd, 0);

    // Log decision made
    await TraceLogger.decisionMade(runId, traceId, decisionSpanId, {
      chosenOption,
      voteSummary,
      agentCount: agents.length,
      durationMs: wallClockMs,
    });

    return {
      chosenOption,
      chosenReason,
      voteSummary,
      agentResults,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      wallClockMs,
    };
  }

  /**
   * Run a single analysis agent. Called in parallel via Promise.allSettled.
   */
  private static async runAgent(
    spec: AgentSpec,
    context: string,
    options: DecisionOption[],
    client: Anthropic,
    runId: string,
    stageId: string,
    traceId: string,
    parentSpanId: string
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const spanId = await TraceLogger.agentSpawn(runId, traceId, parentSpanId, spec.role);

    try {
      const systemPrompt = await SkillLoader.getSkillPromptAsync(spec.skillName);
      const response = await createWithFallback(client, {
        model: 'claude-haiku-4-5-20251001', // Use cheaper model for analysis agents
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: context }],
      });

      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const costUsd = CostTracker.calculateCost({
        inputTokens,
        outputTokens,
        model: 'claude-haiku-4-5-20251001',
        backend: 'anthropic',
      });
      const durationMs = Date.now() - startTime;

      // Parse the JSON vote
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const parsed = JSON.parse(jsonMatch[1] || text);

      // Validate
      const validOption = options.find((o) => o.id === parsed.votedOption);
      const votedOption = validOption ? parsed.votedOption : options[0].id;
      const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));
      const reasoning = parsed.reasoning || 'No reasoning provided';

      // Log vote
      await TraceLogger.agentVote(runId, traceId, spanId, parentSpanId, {
        agentRole: spec.role,
        votedOption,
        confidence,
        reasoning,
      });

      await TraceLogger.agentComplete(runId, traceId, spanId, parentSpanId, spec.role, durationMs, {
        input: inputTokens,
        output: outputTokens,
        cost: costUsd,
      });

      return {
        role: spec.role,
        votedOption,
        confidence,
        reasoning,
        inputTokens,
        outputTokens,
        costUsd,
        durationMs,
        status: 'fulfilled',
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : 'Unknown error';

      await TraceLogger.stageError(runId, traceId, spanId, `${spec.role} agent`, message);

      return {
        role: spec.role,
        votedOption: '',
        confidence: 0,
        reasoning: `Agent failed: ${message}`,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs,
        status: 'rejected',
        error: message,
      };
    }
  }

  /**
   * Tally votes using weighted scoring. Ties broken by highest individual confidence.
   */
  private static tallyVotes(
    results: AgentResult[],
    specs: AgentSpec[],
    options: DecisionOption[]
  ): { chosenOption: string; chosenReason: string; voteSummary: CoordinatorResult['voteSummary'] } {
    const summary: CoordinatorResult['voteSummary'] = {};

    // Initialize all options
    for (const opt of options) {
      summary[opt.id] = { votes: 0, weightedScore: 0, voters: [] };
    }

    // Count votes
    for (const result of results) {
      const spec = specs.find((s) => s.role === result.role);
      const weight = spec?.weight ?? 1.0;
      const optId = result.votedOption;

      if (summary[optId]) {
        summary[optId].votes += 1;
        summary[optId].weightedScore += result.confidence * weight;
        summary[optId].voters.push(result.role);
      }
    }

    // Find winner by weighted score
    let best = options[0].id;
    let bestScore = -1;
    let bestConfidence = -1;

    for (const [optId, data] of Object.entries(summary)) {
      if (data.weightedScore > bestScore) {
        bestScore = data.weightedScore;
        best = optId;
      } else if (data.weightedScore === bestScore) {
        // Tie-break: highest individual confidence
        const maxConf = results
          .filter((r) => r.votedOption === optId)
          .reduce((max, r) => Math.max(max, r.confidence), 0);
        if (maxConf > bestConfidence) {
          bestConfidence = maxConf;
          best = optId;
        }
      }
    }

    // Build reason from top voter reasoning
    const topVoter = results
      .filter((r) => r.votedOption === best)
      .sort((a, b) => b.confidence - a.confidence)[0];
    const chosenReason = topVoter?.reasoning ?? 'Default selection';

    return { chosenOption: best, chosenReason, voteSummary: summary };
  }

  /**
   * Convenience: wraps concurrentDecide to return a DecisionResult for backward compatibility.
   */
  static async decideWithConsensus(
    runId: string,
    stageId: string,
    traceId: string,
    parentSpanId: string,
    decisionPrompt: string,
    options: DecisionOption[],
    client: Anthropic
  ): Promise<{ decision: DecisionResult; coordinator: CoordinatorResult }> {
    const result = await this.concurrentDecide(
      runId, stageId, traceId, parentSpanId,
      decisionPrompt, options, client
    );

    return {
      decision: {
        decision: result.chosenOption,
        reason: result.chosenReason,
        context: JSON.stringify(result.voteSummary),
      },
      coordinator: result,
    };
  }
}
