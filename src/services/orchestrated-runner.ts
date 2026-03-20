/**
 * Orchestrated Runner
 *
 * Replaces the static DAG advancement with Qwen-driven decisions.
 * After each stage completes/is approved, the runner asks the Orchestrator
 * what to do next instead of using hardcoded logic.
 *
 * The runner translates Orchestrator actions into actual DAG executor calls.
 */

import { prisma } from '@/src/lib/prisma';
import { Orchestrator, type PipelineState, type StageSnapshot, type BackendStatus, type OrchestratorAction } from '@/src/services/orchestrator';
import { isOllamaAvailable } from '@/src/lib/ollama-client';
import { SkillLoader } from '@/src/services/skill-loader';
import { existsSync } from 'fs';
import { join } from 'path';

export class OrchestratedRunner {
  /**
   * Ask the orchestrator what to do next for a given run.
   * Returns the action, which the API route can then execute.
   */
  static async getNextAction(runId: string): Promise<OrchestratorAction> {
    const state = await OrchestratedRunner.buildPipelineState(runId);
    const action = await Orchestrator.decide(state);

    // Log the decision
    console.log(`[OrchestratedRunner] Run ${runId}: ${action.type} (foreman latency: ${Orchestrator.getLastDecisionMs()}ms)`);

    return action;
  }

  /**
   * Build the full pipeline state snapshot for the orchestrator.
   */
  static async buildPipelineState(runId: string): Promise<PipelineState> {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        stages: { orderBy: { stageIndex: 'asc' } },
      },
    });

    if (!run) throw new Error(`Run not found: ${runId}`);

    // Build stage snapshots
    const stages: StageSnapshot[] = run.stages.map((s) => ({
      id: s.id,
      nodeId: s.nodeId || s.id,
      displayName: s.displayName,
      skillName: s.skillName,
      status: s.status,
      nodeType: s.nodeType,
      dependsOn: s.dependsOn as string[],
      artifactSummary: s.artifactContent ? s.artifactContent.substring(0, 500) : null,
      userFeedback: s.userFeedback,
      retryCount: s.retryCount,
      durationMs: s.durationMs,
    }));

    // Check backend availability
    const ollamaUp = await isOllamaAvailable();
    let ollamaModels: string[] = [];
    if (ollamaUp) {
      try {
        const res = await fetch(`${process.env.OLLAMA_URL || 'http://10.10.3.7:11434'}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
        const data = await res.json();
        ollamaModels = (data.models || []).map((m: { name: string }) => m.name);
      } catch { /* ignore */ }
    }

    const backends: BackendStatus[] = [
      {
        name: 'claude',
        available: !!process.env.ANTHROPIC_API_KEY,
        models: ['claude-sonnet-4-20250514'],
        costPerToken: 0.000003,
      },
      {
        name: 'ollama',
        available: ollamaUp,
        models: ollamaModels,
        costPerToken: 0,
      },
    ];

    // List available skills
    const skillsDir = join(process.cwd(), '.claude', 'skills');
    let availableSkills: string[] = [];
    try {
      const { readdirSync } = await import('fs');
      availableSkills = readdirSync(skillsDir).filter((name) =>
        existsSync(join(skillsDir, name, 'SKILL.md'))
      );
    } catch { /* ignore */ }

    return {
      runId,
      type: (run.type || 'build') as 'build' | 'diagnostic' | 'refactor',
      userInput: run.userInput,
      stages,
      availableSkills,
      availableBackends: backends,
    };
  }
}
