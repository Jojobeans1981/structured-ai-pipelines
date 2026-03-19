import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { createWithFallback } from '@/src/lib/anthropic';

const DECISION_SYSTEM_PROMPT = `You are a decision agent in the Gauntlet Forge pipeline. You analyze the current state of a project build and make a routing decision.

You will be given:
1. The project context (user input, PRD, current artifacts)
2. The decision to make (described in the decision prompt)
3. The available options (branch paths)

Respond with ONLY valid JSON:
{
  "decision": "<chosen option id>",
  "reason": "<one sentence explanation>",
  "context": "<any additional context for the chosen branch>"
}`;

export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  targetNodeId: string;
}

export interface DecisionResult {
  decision: string;
  reason: string;
  context: string;
}

export class DecisionAgent {
  /**
   * Make a routing decision based on project state.
   */
  static async decide(
    runId: string,
    stageId: string,
    decisionPrompt: string,
    options: DecisionOption[],
    client: Anthropic
  ): Promise<DecisionResult> {
    // Gather context from the run
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
        contextParts.push(`## ${stage.displayName}\n${stage.artifactContent.substring(0, 2000)}`);
      }
    }

    const optionsText = options.map((o) =>
      `- **${o.id}**: ${o.label} — ${o.description}`
    ).join('\n');

    const prompt = `## Project Context\n${contextParts.join('\n\n')}\n\n## Decision Required\n${decisionPrompt}\n\n## Available Options\n${optionsText}\n\nChoose the best option and explain why.`;

    console.log(`[DecisionAgent] Making decision for stage ${stageId}: ${decisionPrompt.substring(0, 80)}`);

    const response = await createWithFallback(client, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: DECISION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const result: DecisionResult = JSON.parse(jsonMatch[1] || text);

      // Validate the chosen option exists
      const validOption = options.find((o) => o.id === result.decision);
      if (!validOption) {
        console.warn(`[DecisionAgent] Invalid decision "${result.decision}", defaulting to first option`);
        return { decision: options[0].id, reason: 'Default selection', context: '' };
      }

      console.log(`[DecisionAgent] Decision: ${result.decision} — ${result.reason}`);
      return result;
    } catch {
      console.error('[DecisionAgent] Failed to parse decision, using default');
      return { decision: options[0].id, reason: 'Parse error, using default', context: '' };
    }
  }

  /**
   * Apply a decision by activating the chosen branch and skipping others.
   */
  static async applyDecision(
    runId: string,
    decisionNodeId: string,
    chosenTargetNodeId: string,
    options: DecisionOption[]
  ): Promise<void> {
    const allStages = await prisma.pipelineStage.findMany({
      where: { runId },
    });

    // Find nodes that should be skipped (branches not taken)
    const skippedTargets = options
      .filter((o) => o.targetNodeId !== chosenTargetNodeId)
      .map((o) => o.targetNodeId);

    // Recursively find all downstream nodes of skipped targets
    const toSkip = new Set<string>();

    function findDownstream(nodeId: string) {
      for (const s of allStages) {
        const sNodeId = s.nodeId || s.id;
        if (s.dependsOn.includes(nodeId) && !toSkip.has(s.id)) {
          // Only skip if ALL dependencies are in the skip set or this decision
          const allDepsSkipped = s.dependsOn.every(
            (dep) => dep === nodeId || skippedTargets.includes(dep) || Array.from(toSkip).some(
              (skipId) => allStages.find((st) => st.id === skipId)?.nodeId === dep
            )
          );
          if (allDepsSkipped) {
            toSkip.add(s.id);
            findDownstream(sNodeId);
          }
        }
      }
    }

    for (const target of skippedTargets) {
      const stage = allStages.find((s) => s.nodeId === target || s.id === target);
      if (stage) {
        toSkip.add(stage.id);
        findDownstream(target);
      }
    }

    if (toSkip.size > 0) {
      await prisma.pipelineStage.updateMany({
        where: { id: { in: Array.from(toSkip) } },
        data: { status: 'skipped' },
      });

      console.log(`[DecisionAgent] Skipped ${toSkip.size} nodes on non-chosen branches`);
    }
  }
}
