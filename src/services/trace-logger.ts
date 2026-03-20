import { prisma } from '@/src/lib/prisma';
import { randomBytes } from 'crypto';

export type TraceEventType =
  | 'pipeline_start'
  | 'pipeline_complete'
  | 'stage_start'
  | 'stage_complete'
  | 'stage_error'
  | 'agent_spawn'
  | 'agent_complete'
  | 'agent_vote'
  | 'decision_start'
  | 'decision_made'
  | 'retry'
  | 'reroute'
  | 'escalate'
  | 'gate_awaiting'
  | 'gate_approved'
  | 'gate_rejected'
  | 'file_extracted'
  | 'build_verify'
  | 'cost_recorded';

interface LogParams {
  runId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  eventType: TraceEventType;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export class TraceLogger {
  static generateTraceId(): string {
    return `trace_${randomBytes(12).toString('hex')}`;
  }

  static generateSpanId(): string {
    return `span_${randomBytes(8).toString('hex')}`;
  }

  // Core: write event to DB + console. Fire-and-forget to never block pipeline.
  static async log(params: LogParams): Promise<void> {
    const {
      runId, traceId, spanId, parentSpanId, eventType,
      source, message, metadata, durationMs,
      inputTokens, outputTokens, costUsd,
    } = params;

    // Always log to console for dev visibility
    const prefix = parentSpanId ? `  └─ [${source}]` : `[${source}]`;
    const tokenInfo = inputTokens || outputTokens
      ? ` (${inputTokens ?? 0}in/${outputTokens ?? 0}out${costUsd ? ` $${costUsd.toFixed(4)}` : ''})`
      : '';
    const duration = durationMs ? ` [${durationMs}ms]` : '';
    console.log(`${prefix} ${eventType}: ${message}${tokenInfo}${duration}`);

    // Write to DB — fire and forget
    prisma.traceEvent.create({
      data: {
        runId,
        traceId,
        spanId,
        parentSpanId: parentSpanId ?? null,
        eventType,
        source,
        message,
        metadata: (metadata ?? {}) as Record<string, string | number | boolean | null>,
        durationMs: durationMs ?? null,
        inputTokens: inputTokens ?? null,
        outputTokens: outputTokens ?? null,
        costUsd: costUsd ?? null,
      },
    }).catch((err) => {
      console.error(`[TraceLogger] Failed to persist event: ${err.message}`);
    });
  }

  // --- Convenience methods ---

  static async pipelineStart(runId: string, traceId: string, input: string): Promise<string> {
    const spanId = this.generateSpanId();
    await this.log({
      runId, traceId, spanId,
      eventType: 'pipeline_start',
      source: 'dag-executor',
      message: `Pipeline started: ${input.substring(0, 100)}...`,
      metadata: { inputLength: input.length },
    });
    return spanId;
  }

  static async pipelineComplete(runId: string, traceId: string, spanId: string, durationMs: number, outcome: string): Promise<void> {
    await this.log({
      runId, traceId, spanId,
      eventType: 'pipeline_complete',
      source: 'dag-executor',
      message: `Pipeline ${outcome} in ${(durationMs / 1000).toFixed(1)}s`,
      durationMs,
      metadata: { outcome },
    });
  }

  static async stageStart(runId: string, traceId: string, stageId: string, displayName: string): Promise<string> {
    const spanId = this.generateSpanId();
    await this.log({
      runId, traceId, spanId,
      eventType: 'stage_start',
      source: 'dag-executor',
      message: `Stage started: ${displayName}`,
      metadata: { stageId },
    });
    return spanId;
  }

  static async stageComplete(runId: string, traceId: string, spanId: string, displayName: string, durationMs: number, tokens?: { input: number; output: number; cost: number }): Promise<void> {
    await this.log({
      runId, traceId, spanId,
      eventType: 'stage_complete',
      source: 'dag-executor',
      message: `Stage complete: ${displayName}`,
      durationMs,
      inputTokens: tokens?.input,
      outputTokens: tokens?.output,
      costUsd: tokens?.cost,
    });
  }

  static async stageError(runId: string, traceId: string, spanId: string, displayName: string, error: string): Promise<void> {
    await this.log({
      runId, traceId, spanId,
      eventType: 'stage_error',
      source: 'dag-executor',
      message: `Stage error: ${displayName} — ${error}`,
      metadata: { error },
    });
  }

  static async agentSpawn(runId: string, traceId: string, parentSpanId: string, agentRole: string): Promise<string> {
    const spanId = this.generateSpanId();
    await this.log({
      runId, traceId, spanId, parentSpanId,
      eventType: 'agent_spawn',
      source: 'agent-coordinator',
      message: `Spawned ${agentRole} analysis agent`,
      metadata: { agentRole },
    });
    return spanId;
  }

  static async agentComplete(runId: string, traceId: string, spanId: string, parentSpanId: string, agentRole: string, durationMs: number, tokens?: { input: number; output: number; cost: number }): Promise<void> {
    await this.log({
      runId, traceId, spanId, parentSpanId,
      eventType: 'agent_complete',
      source: 'agent-coordinator',
      message: `${agentRole} agent completed`,
      durationMs,
      inputTokens: tokens?.input,
      outputTokens: tokens?.output,
      costUsd: tokens?.cost,
    });
  }

  static async agentVote(runId: string, traceId: string, spanId: string, parentSpanId: string, vote: {
    agentRole: string;
    votedOption: string;
    confidence: number;
    reasoning: string;
  }): Promise<void> {
    await this.log({
      runId, traceId, spanId, parentSpanId,
      eventType: 'agent_vote',
      source: 'agent-coordinator',
      message: `${vote.agentRole} votes "${vote.votedOption}" (confidence: ${(vote.confidence * 100).toFixed(0)}%)`,
      metadata: vote,
    });
  }

  static async decisionStart(runId: string, traceId: string, parentSpanId: string, prompt: string, optionCount: number): Promise<string> {
    const spanId = this.generateSpanId();
    await this.log({
      runId, traceId, spanId, parentSpanId,
      eventType: 'decision_start',
      source: 'agent-coordinator',
      message: `Decision point: ${prompt.substring(0, 100)} (${optionCount} options)`,
      metadata: { optionCount },
    });
    return spanId;
  }

  static async decisionMade(runId: string, traceId: string, spanId: string, decision: {
    chosenOption: string;
    voteSummary: Record<string, unknown>;
    agentCount: number;
    durationMs: number;
  }): Promise<void> {
    await this.log({
      runId, traceId, spanId,
      eventType: 'decision_made',
      source: 'agent-coordinator',
      message: `Decision: "${decision.chosenOption}" (${decision.agentCount} agents, ${decision.durationMs}ms)`,
      durationMs: decision.durationMs,
      metadata: decision,
    });
  }

  static async gateApproved(runId: string, traceId: string, spanId: string, stageName: string): Promise<void> {
    await this.log({
      runId, traceId, spanId,
      eventType: 'gate_approved',
      source: 'dag-executor',
      message: `Gate approved: ${stageName}`,
    });
  }

  static async gateRejected(runId: string, traceId: string, spanId: string, stageName: string, feedback: string): Promise<void> {
    await this.log({
      runId, traceId, spanId,
      eventType: 'gate_rejected',
      source: 'dag-executor',
      message: `Gate rejected: ${stageName}`,
      metadata: { feedback: feedback.substring(0, 500) },
    });
  }

  // --- Query methods for timeline UI ---

  static async getTraceEvents(runId: string): Promise<unknown[]> {
    return prisma.traceEvent.findMany({
      where: { runId },
      orderBy: { timestamp: 'asc' },
    });
  }

  static async getAgentVotes(runId: string): Promise<unknown[]> {
    return prisma.agentVote.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async getSpanTree(runId: string): Promise<unknown[]> {
    const events = await prisma.traceEvent.findMany({
      where: { runId },
      orderBy: { timestamp: 'asc' },
    });

    // Build hierarchical tree from flat events
    const roots: unknown[] = [];
    const bySpan = new Map<string, Record<string, unknown> & { children: unknown[] }>();

    for (const event of events) {
      const e = event as Record<string, unknown>;
      const node = bySpan.get(e.spanId as string) || { ...e, children: [] };
      if (!bySpan.has(e.spanId as string)) {
        bySpan.set(e.spanId as string, node);
      } else {
        Object.assign(node, e);
      }

      if (e.parentSpanId) {
        const parent = bySpan.get(e.parentSpanId as string);
        if (parent) {
          parent.children.push(node);
        } else {
          const placeholder = { spanId: e.parentSpanId, children: [node] } as Record<string, unknown> & { children: unknown[] };
          bySpan.set(e.parentSpanId as string, placeholder);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
