/**
 * Qwen Orchestrator — The Foreman
 *
 * A small, fast local LLM (Qwen 2.5 Coder 1.5B) running on the Mac Mini
 * that acts as the pipeline's decision-making brain.
 *
 * It does NOT generate code or content. It decides:
 * - Which skill/agent to run next
 * - Which backend should handle it (Claude vs Ollama)
 * - What context to pass
 * - Whether stages can run in parallel
 * - When to pause for human review
 * - How to handle failures (retry, reroute, escalate)
 *
 * Think of it as the factory foreman — it reads the blueprint (execution plan),
 * looks at what's been built so far, and tells each worker what to do next.
 */

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://10.10.3.7:11434';
const ORCHESTRATOR_MODEL = process.env.ORCHESTRATOR_MODEL || 'qwen2.5-coder:1.5b';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PipelineState {
  runId: string;
  type: 'build' | 'diagnostic' | 'refactor';
  userInput: string;
  stages: StageSnapshot[];
  availableSkills: string[];
  availableBackends: BackendStatus[];
}

export interface StageSnapshot {
  id: string;
  nodeId: string;
  displayName: string;
  skillName: string;
  status: string;
  nodeType: string;
  dependsOn: string[];
  artifactSummary: string | null;  // first 500 chars of artifact
  userFeedback: string | null;
  retryCount: number;
  durationMs: number | null;
}

export interface BackendStatus {
  name: string;
  available: boolean;
  models: string[];
  costPerToken: number;  // 0 for local
}

export type OrchestratorAction =
  | { type: 'execute'; stageId: string; backend: 'claude' | 'ollama'; reason: string }
  | { type: 'execute_parallel'; stages: Array<{ stageId: string; backend: 'claude' | 'ollama' }>; reason: string }
  | { type: 'await_human'; stageId: string; reason: string }
  | { type: 'retry'; stageId: string; backend: 'claude' | 'ollama'; modifiedContext: string; reason: string }
  | { type: 'reroute'; fromStageId: string; toSkill: string; reason: string }
  | { type: 'escalate'; message: string; reason: string }
  | { type: 'complete'; summary: string };

// ─── System Prompt ──────────────────────────────────────────────────────────

const FOREMAN_SYSTEM_PROMPT = `You are the Foreman — a pipeline orchestrator for an AI software factory.

You receive the current state of a pipeline run and decide WHAT HAPPENS NEXT.

## Your Role
- You do NOT generate code, PRDs, or content
- You DECIDE which agent runs next, on which backend, with what context
- You are fast, cheap, and run locally — your job is to make smart routing decisions

## Available Backends
- **claude**: Expensive but powerful. Use for: PRD writing, architecture, code generation, complex analysis
- **ollama**: Free and local. Use for: quiz generation, code review, validation, simple analysis, education

## Decision Rules
1. If a stage has all dependencies approved and is pending → decide whether to execute it
2. If multiple independent stages are ready → run them in parallel
3. If a stage failed and retry_count < 3 → retry, possibly on a different backend
4. If a stage needs human review (gate type) → await_human
5. If all stages are approved → complete
6. Complex generation tasks → claude. Simple/derivative tasks → ollama
7. If a stage was rejected with feedback, include that feedback in the retry context

## Output Format
Respond with ONLY a JSON object matching one of these action types:

{"type":"execute","stageId":"...","backend":"claude|ollama","reason":"..."}
{"type":"execute_parallel","stages":[{"stageId":"...","backend":"..."}],"reason":"..."}
{"type":"await_human","stageId":"...","reason":"..."}
{"type":"retry","stageId":"...","backend":"...","modifiedContext":"...","reason":"..."}
{"type":"reroute","fromStageId":"...","toSkill":"...","reason":"..."}
{"type":"escalate","message":"...","reason":"..."}
{"type":"complete","summary":"..."}

ONLY output the JSON. No explanation. No markdown. No code fences.`;

// ─── Core Class ─────────────────────────────────────────────────────────────

export class Orchestrator {
  private static lastDecisionMs = 0;

  /**
   * Ask the foreman what to do next given the current pipeline state.
   */
  static async decide(state: PipelineState): Promise<OrchestratorAction> {
    const startMs = Date.now();

    const statePrompt = Orchestrator.buildStatePrompt(state);

    try {
      const response = await fetch(`${ORCHESTRATOR_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ORCHESTRATOR_MODEL,
          messages: [
            { role: 'system', content: FOREMAN_SYSTEM_PROMPT },
            { role: 'user', content: statePrompt },
          ],
          stream: false,
          options: {
            temperature: 0.1,      // Low temp = deterministic decisions
            num_predict: 512,      // Decisions are short
            top_p: 0.9,
          },
        }),
        signal: AbortSignal.timeout(10000),  // 10s max — foreman must be fast
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Orchestrator error ${response.status}: ${text}`);
      }

      const data = await response.json();
      const content = data.message?.content || '';

      Orchestrator.lastDecisionMs = Date.now() - startMs;
      console.log(`[Orchestrator] Decision in ${Orchestrator.lastDecisionMs}ms`);

      return Orchestrator.parseAction(content, state);
    } catch (err) {
      console.error('[Orchestrator] Qwen unavailable, falling back to static routing');
      return Orchestrator.fallbackDecision(state);
    }
  }

  /**
   * Build a concise state description for the foreman.
   * Keep it short — Qwen 1.5B has limited context.
   */
  private static buildStatePrompt(state: PipelineState): string {
    const lines: string[] = [
      `## Pipeline Run: ${state.runId}`,
      `Type: ${state.type}`,
      `Input: ${state.userInput.substring(0, 200)}`,
      '',
      '## Stage Status:',
    ];

    for (const stage of state.stages) {
      let line = `- [${stage.status.toUpperCase()}] "${stage.displayName}" (skill: ${stage.skillName}, type: ${stage.nodeType})`;
      if (stage.dependsOn.length > 0) {
        line += ` depends_on: [${stage.dependsOn.join(', ')}]`;
      }
      if (stage.userFeedback) {
        line += ` | feedback: "${stage.userFeedback.substring(0, 100)}"`;
      }
      if (stage.retryCount > 0) {
        line += ` | retries: ${stage.retryCount}`;
      }
      if (stage.durationMs) {
        line += ` | took: ${stage.durationMs}ms`;
      }
      lines.push(line);
    }

    lines.push('');
    lines.push('## Available Backends:');
    for (const backend of state.availableBackends) {
      lines.push(`- ${backend.name}: ${backend.available ? 'UP' : 'DOWN'} (models: ${backend.models.join(', ')}, cost: ${backend.costPerToken === 0 ? 'free' : '$' + backend.costPerToken + '/token'})`);
    }

    lines.push('');
    lines.push('## Available Skills:');
    lines.push(state.availableSkills.join(', '));

    lines.push('');
    lines.push('What should happen next? Respond with a single JSON action.');

    return lines.join('\n');
  }

  /**
   * Parse the foreman's response into a typed action.
   * Handles malformed JSON gracefully.
   */
  private static parseAction(content: string, state: PipelineState): OrchestratorAction {
    // Try to extract JSON from the response
    let jsonStr = content.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    try {
      const action = JSON.parse(jsonStr) as OrchestratorAction;

      // Validate the action has required fields
      if (!action.type) {
        throw new Error('Missing action type');
      }

      const reason = 'reason' in action ? (action as { reason: string }).reason : 'no reason';
      console.log(`[Orchestrator] Action: ${action.type} — ${reason}`);
      return action;
    } catch (err) {
      console.warn(`[Orchestrator] Failed to parse response: ${content.substring(0, 200)}`);
      // Fall back to static routing
      return Orchestrator.fallbackDecision(state);
    }
  }

  /**
   * Static fallback when Qwen is unavailable or returns garbage.
   * This is the same logic the old model-router used.
   */
  static fallbackDecision(state: PipelineState): OrchestratorAction {
    const HEAVY_SKILLS = new Set([
      'prd-architect', 'phase-builder', 'prompt-builder', 'phase-executor',
      'root-cause-analyzer', 'fix-planner', 'fix-executor',
    ]);

    // Find stages that are ready (pending + all deps approved)
    const approvedNodeIds = new Set(
      state.stages
        .filter((s) => s.status === 'approved' || s.status === 'skipped')
        .map((s) => s.nodeId)
    );

    const readyStages = state.stages.filter((s) => {
      if (s.status !== 'pending') return false;
      return s.dependsOn.every((dep) => approvedNodeIds.has(dep));
    });

    // All done?
    const allTerminal = state.stages.every(
      (s) => s.status === 'approved' || s.status === 'skipped' || s.status === 'failed'
    );
    if (allTerminal) {
      return { type: 'complete', summary: 'All stages complete.' };
    }

    // Nothing ready?
    if (readyStages.length === 0) {
      // Check for stages awaiting approval
      const awaitingApproval = state.stages.find((s) => s.status === 'awaiting_approval');
      if (awaitingApproval) {
        return { type: 'await_human', stageId: awaitingApproval.id, reason: 'Stage awaiting human approval' };
      }
      return { type: 'escalate', message: 'No stages ready and none awaiting approval', reason: 'Pipeline stuck' };
    }

    // Multiple ready? Run in parallel
    if (readyStages.length > 1) {
      return {
        type: 'execute_parallel',
        stages: readyStages.map((s) => ({
          stageId: s.id,
          backend: HEAVY_SKILLS.has(s.skillName) ? 'claude' as const : 'ollama' as const,
        })),
        reason: `${readyStages.length} independent stages ready for parallel execution`,
      };
    }

    // Single stage ready
    const stage = readyStages[0];
    if (stage.nodeType === 'gate') {
      return { type: 'await_human', stageId: stage.id, reason: `Gate: ${stage.displayName}` };
    }

    const backend = HEAVY_SKILLS.has(stage.skillName) ? 'claude' as const : 'ollama' as const;
    return {
      type: 'execute',
      stageId: stage.id,
      backend,
      reason: `Next stage: ${stage.displayName} (${stage.skillName})`,
    };
  }

  /**
   * Get the last decision latency for metrics.
   */
  static getLastDecisionMs(): number {
    return Orchestrator.lastDecisionMs;
  }

  /**
   * Check if the Qwen orchestrator is reachable.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return false;
      const data = await res.json();
      const models = (data.models || []).map((m: { name: string }) => m.name);
      return models.some((name: string) =>
        name === ORCHESTRATOR_MODEL || name.startsWith(ORCHESTRATOR_MODEL.split(':')[0])
      );
    } catch {
      return false;
    }
  }
}
