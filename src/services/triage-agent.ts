import Anthropic from '@anthropic-ai/sdk';
import { type TriageDecision } from '@/src/types/dag';
import { prisma } from '@/src/lib/prisma';
import { createWithFallback } from '@/src/lib/anthropic';

const TRIAGE_SYSTEM_PROMPT = `You are the Gauntlet Forge Triage Agent. A build verification or stage execution has failed. Your job is to analyze the error and decide the best recovery action.

## Available actions:

1. **retry** — Re-run the failed node with additional error context injected into the prompt. Use this when:
   - The error is a fixable code issue (missing import, wrong syntax, type error)
   - Adding the error output to the prompt will help the executor fix it
   - The node has retries remaining

2. **reroute** — Go back to an earlier node and re-run from there. Use this when:
   - The error is caused by a bad decision in a prior stage (wrong architecture, incompatible API contract)
   - The earlier node's output needs to change to fix the downstream error
   - Specify which node to go back to

3. **escalate** — Pause the pipeline and ask the human for help. Use this when:
   - The error is ambiguous or requires a judgment call
   - Max retries have been exhausted
   - The error suggests a fundamental misunderstanding of the requirements

## Output format:
Respond with ONLY valid JSON (no markdown, no explanation):

For retry:
{ "action": "retry", "nodeId": "<id of node to retry>", "modifiedContext": "<additional context to inject, including the error>" }

For reroute:
{ "action": "reroute", "targetNodeId": "<id of earlier node to re-run>", "reason": "<why this node needs to change>" }

For escalate:
{ "action": "escalate", "reason": "<what the human needs to decide>" }`;

export class TriageAgent {
  /**
   * Analyze a failure and decide recovery action.
   */
  static async triage(
    failedStageId: string,
    errorOutput: string,
    client: Anthropic
  ): Promise<TriageDecision> {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: failedStageId },
      include: {
        run: {
          include: {
            stages: { orderBy: { stageIndex: 'asc' } },
          },
        },
      },
    });

    if (!stage) throw new Error(`Stage not found: ${failedStageId}`);

    // If max retries exhausted, auto-escalate
    if (stage.retryCount >= stage.maxRetries) {
      console.log(`[TriageAgent] Max retries (${stage.maxRetries}) exhausted for "${stage.displayName}" — escalating`);
      return {
        action: 'escalate',
        reason: `Node "${stage.displayName}" failed ${stage.retryCount} times. Last error:\n\n${errorOutput.substring(0, 500)}`,
      };
    }

    // Build context for the triage agent
    const nodeList = stage.run.stages.map((s) =>
      `- ${s.nodeId || s.id}: "${s.displayName}" (${s.status}, type: ${s.nodeType})`
    ).join('\n');

    const prompt = `## Failed Node
- ID: ${stage.nodeId || stage.id}
- Name: ${stage.displayName}
- Type: ${stage.nodeType}
- Skill: ${stage.skillName}
- Retry count: ${stage.retryCount} / ${stage.maxRetries}

## Error Output
\`\`\`
${errorOutput.substring(0, 3000)}
\`\`\`

## All Nodes in Pipeline
${nodeList}

## Dependencies of Failed Node
${stage.dependsOn.length > 0 ? stage.dependsOn.join(', ') : 'None (root node)'}

Analyze the error and decide: retry, reroute, or escalate?`;

    console.log(`[TriageAgent] Analyzing failure of "${stage.displayName}" (retry ${stage.retryCount}/${stage.maxRetries})`);

    const response = await createWithFallback(client, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: TRIAGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const decision: TriageDecision = JSON.parse(jsonMatch[1] || text);

      console.log(`[TriageAgent] Decision: ${decision.action}`);
      return decision;
    } catch {
      console.error('[TriageAgent] Failed to parse decision, escalating:', text.substring(0, 200));
      return {
        action: 'escalate',
        reason: `Triage agent returned unparseable response. Original error:\n\n${errorOutput.substring(0, 500)}`,
      };
    }
  }

  /**
   * Apply a triage decision to the pipeline.
   */
  static async applyDecision(
    runId: string,
    decision: TriageDecision
  ): Promise<void> {
    switch (decision.action) {
      case 'retry': {
        const stage = await prisma.pipelineStage.findFirst({
          where: {
            runId,
            OR: [
              { nodeId: decision.nodeId },
              { id: decision.nodeId },
            ],
          },
        });

        if (!stage) {
          console.error(`[TriageAgent] Cannot retry — node "${decision.nodeId}" not found`);
          return;
        }

        await prisma.pipelineStage.update({
          where: { id: stage.id },
          data: {
            status: 'running',
            startedAt: new Date(),
            completedAt: null,
            approvedAt: null,
            durationMs: null,
            artifactContent: null,
            streamContent: stage.artifactContent || stage.streamContent,
            userFeedback: decision.modifiedContext,
            retryCount: stage.retryCount + 1,
          },
        });

        console.log(`[TriageAgent] Retrying node "${stage.displayName}" with error context`);
        break;
      }

      case 'reroute': {
        // Reset the target node and all downstream nodes
        const targetStage = await prisma.pipelineStage.findFirst({
          where: {
            runId,
            OR: [
              { nodeId: decision.targetNodeId },
              { id: decision.targetNodeId },
            ],
          },
        });

        if (!targetStage) {
          console.error(`[TriageAgent] Cannot reroute — node "${decision.targetNodeId}" not found`);
          return;
        }

        // Reset the target node
        await prisma.pipelineStage.update({
          where: { id: targetStage.id },
          data: {
            status: 'running',
            startedAt: new Date(),
            completedAt: null,
            approvedAt: null,
            durationMs: null,
            artifactContent: null,
            streamContent: targetStage.artifactContent,
            userFeedback: `REROUTED: ${decision.reason}`,
            retryCount: targetStage.retryCount + 1,
          },
        });

        // Reset all nodes that depend on the target (direct or transitive)
        const allStages = await prisma.pipelineStage.findMany({
          where: { runId },
        });

        const targetNodeId = targetStage.nodeId || targetStage.id;
        const toReset = new Set<string>();

        const findDownstream = (nodeId: string): void => {
          for (const s of allStages) {
            if (s.dependsOn.includes(nodeId) && !toReset.has(s.id)) {
              toReset.add(s.id);
              findDownstream(s.nodeId || s.id);
            }
          }
        };

        findDownstream(targetNodeId);

        if (toReset.size > 0) {
          await prisma.pipelineStage.updateMany({
            where: { id: { in: Array.from(toReset) } },
            data: {
              status: 'pending',
              startedAt: null,
              completedAt: null,
              approvedAt: null,
              durationMs: null,
              artifactContent: null,
              streamContent: null,
            },
          });

          console.log(`[TriageAgent] Reset ${toReset.size} downstream nodes`);
        }

        console.log(`[TriageAgent] Rerouted to "${targetStage.displayName}": ${decision.reason}`);
        break;
      }

      case 'escalate': {
        await prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: 'paused' },
        });

        console.log(`[TriageAgent] Escalated to human: ${decision.reason}`);
        break;
      }
    }
  }
}
