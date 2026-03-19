import { prisma } from '@/src/lib/prisma';
import { type DAGNode, type ExecutionPlan } from '@/src/types/dag';

interface ParsedPhase {
  index: number;
  name: string;
  description: string;
  dependsOnPhases: number[];
}

/**
 * GraphExpander handles dynamic DAG expansion after the phase-builder
 * stage completes. It parses the phase-builder output, identifies phases,
 * and creates prompt-builder → phase-executor chains for each one.
 */
export class GraphExpander {
  /**
   * Parse phase-builder output to extract individual phases.
   * Looks for patterns like:
   *   ## Phase 0: Project Scaffolding
   *   ### Phase 1: Core Game Logic
   *   # Phase 2 — UI Components
   */
  static parsePhases(artifactContent: string): ParsedPhase[] {
    const phases: ParsedPhase[] = [];
    const lines = artifactContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(
        /^#{1,4}\s*Phase\s+(\d+)\s*[:\-—–]\s*(.+)/i
      );
      if (!match) continue;

      const index = parseInt(match[1], 10);
      const name = match[2].trim();

      // Collect description until next phase heading or end
      const descLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        if (lines[j].match(/^#{1,4}\s*Phase\s+\d+\s*[:\-—–]/i)) break;
        descLines.push(lines[j]);
        j++;
      }

      const description = descLines.join('\n').trim().substring(0, 500);

      // Phase 0 has no dependencies; others depend on phase 0 at minimum
      const dependsOnPhases = index === 0 ? [] : [0];

      phases.push({ index, name, description, dependsOnPhases });
    }

    // If no phases found with heading pattern, try to count sections
    if (phases.length === 0) {
      // Fallback: look for numbered sections
      const sectionMatches = artifactContent.matchAll(
        /(?:^|\n)#{1,3}\s*(?:\d+\.?\s*)?(.+?)(?:\n|$)/g
      );
      let idx = 0;
      for (const m of sectionMatches) {
        if (idx > 8) break; // max 8 phases
        phases.push({
          index: idx,
          name: m[1].trim(),
          description: '',
          dependsOnPhases: idx === 0 ? [] : [0],
        });
        idx++;
      }
    }

    console.log(`[GraphExpander] Parsed ${phases.length} phases from artifact`);
    return phases;
  }

  /**
   * Expand the DAG after phase-builder completes.
   * Creates prompt-builder → phase-executor chains for each phase.
   * Adds a verify node after all builds, and a final gate.
   */
  static async expandAfterPhaseBuilder(
    runId: string,
    phaseBuilderStageId: string,
    artifactContent: string
  ): Promise<{ nodesCreated: number }> {
    const phases = GraphExpander.parsePhases(artifactContent);

    if (phases.length === 0) {
      console.warn('[GraphExpander] No phases found in artifact — skipping expansion');
      return { nodesCreated: 0 };
    }

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: { stages: { orderBy: { stageIndex: 'asc' } } },
    });

    if (!run) throw new Error(`Run not found: ${runId}`);

    // Find the phase-builder stage to use as dependency
    const phaseBuilderStage = run.stages.find((s) => s.id === phaseBuilderStageId);
    if (!phaseBuilderStage) throw new Error('Phase builder stage not found');
    const phaseBuilderNodeId = phaseBuilderStage.nodeId || phaseBuilderStage.id;

    // Remove any existing placeholder phase nodes (from the initial intake plan)
    const existingPhaseNodes = run.stages.filter(
      (s) => s.phaseIndex !== null && s.skillName !== 'prd-architect' && s.skillName !== 'phase-builder'
    );

    // Also remove verify and final-gate nodes — we'll recreate them
    const existingVerifyGates = run.stages.filter(
      (s) => s.nodeType === 'verify' || s.nodeType === 'gate'
    );

    const toRemove = [...existingPhaseNodes, ...existingVerifyGates].map((s) => s.id);

    let nextStageIndex = run.stages.length;
    const newNodes: Array<{
      runId: string;
      stageIndex: number;
      skillName: string;
      displayName: string;
      status: string;
      dependsOn: string[];
      nodeType: string;
      parallelGroup: string | null;
      gateType: string | null;
      maxRetries: number;
      phaseIndex: number | null;
      nodeId: string;
      retryCount: number;
    }> = [];

    // Phase 0 always runs first (scaffolding)
    const phase0 = phases.find((p) => p.index === 0);
    const phase0PromptNodeId = 'phase-0-prompts';
    const phase0BuildNodeId = 'phase-0-build';

    if (phase0) {
      newNodes.push({
        runId,
        stageIndex: nextStageIndex++,
        skillName: 'prompt-builder',
        displayName: `Phase 0: ${phase0.name} — Prompts`,
        status: 'pending',
        dependsOn: [phaseBuilderNodeId],
        nodeType: 'skill',
        parallelGroup: null,
        gateType: null,
        maxRetries: 2,
        phaseIndex: 0,
        nodeId: phase0PromptNodeId,
        retryCount: 0,
      });

      newNodes.push({
        runId,
        stageIndex: nextStageIndex++,
        skillName: 'phase-executor',
        displayName: `Phase 0: ${phase0.name} — Build`,
        status: 'pending',
        dependsOn: [phase0PromptNodeId],
        nodeType: 'skill',
        parallelGroup: null,
        gateType: null,
        maxRetries: 2,
        phaseIndex: 0,
        nodeId: phase0BuildNodeId,
        retryCount: 0,
      });
    }

    // Remaining phases — depend on phase 0 build
    const allBuildNodeIds: string[] = phase0 ? [phase0BuildNodeId] : [];

    for (const phase of phases) {
      if (phase.index === 0) continue;

      const promptNodeId = `phase-${phase.index}-prompts`;
      const buildNodeId = `phase-${phase.index}-build`;

      // Determine dependencies: phase-builder output + phase 0 build
      const deps = [phaseBuilderNodeId];
      if (phase0) deps.push(phase0BuildNodeId);

      // Phases with higher-numbered dependencies
      for (const depIdx of phase.dependsOnPhases) {
        if (depIdx !== 0) {
          deps.push(`phase-${depIdx}-build`);
        }
      }

      // Group parallel phases (phases at same dependency depth)
      const parallelGroup = phase.dependsOnPhases.length <= 1 ? `parallel-tier-1` : `parallel-tier-2`;

      newNodes.push({
        runId,
        stageIndex: nextStageIndex++,
        skillName: 'prompt-builder',
        displayName: `Phase ${phase.index}: ${phase.name} — Prompts`,
        status: 'pending',
        dependsOn: deps,
        nodeType: 'skill',
        parallelGroup: null,
        gateType: null,
        maxRetries: 2,
        phaseIndex: phase.index,
        nodeId: promptNodeId,
        retryCount: 0,
      });

      newNodes.push({
        runId,
        stageIndex: nextStageIndex++,
        skillName: 'phase-executor',
        displayName: `Phase ${phase.index}: ${phase.name} — Build`,
        status: 'pending',
        dependsOn: [promptNodeId],
        nodeType: 'skill',
        parallelGroup,
        gateType: null,
        maxRetries: 2,
        phaseIndex: phase.index,
        nodeId: buildNodeId,
        retryCount: 0,
      });

      allBuildNodeIds.push(buildNodeId);
    }

    // Verify node — depends on all build nodes
    const verifyNodeId = 'verify-build';
    newNodes.push({
      runId,
      stageIndex: nextStageIndex++,
      skillName: '__verify__',
      displayName: 'Build Verification',
      status: 'pending',
      dependsOn: allBuildNodeIds,
      nodeType: 'verify',
      parallelGroup: null,
      gateType: null,
      maxRetries: 2,
      phaseIndex: null,
      nodeId: verifyNodeId,
      retryCount: 0,
    });

    // Final review gate
    newNodes.push({
      runId,
      stageIndex: nextStageIndex++,
      skillName: '__gate__',
      displayName: 'Final Review',
      status: 'pending',
      dependsOn: [verifyNodeId],
      nodeType: 'gate',
      gateType: 'final_review',
      parallelGroup: null,
      maxRetries: 0,
      phaseIndex: null,
      nodeId: 'final-gate',
      retryCount: 0,
    });

    // Apply in transaction
    await prisma.$transaction(async (tx) => {
      // Remove old placeholder nodes
      if (toRemove.length > 0) {
        await tx.pipelineStage.deleteMany({
          where: { id: { in: toRemove } },
        });
      }

      // Create new nodes
      for (const node of newNodes) {
        await tx.pipelineStage.create({ data: node });
      }

      // Update execution plan on the run
      const updatedPlan: Partial<ExecutionPlan> = {
        estimatedPhases: phases.length,
        nodes: newNodes.map((n) => ({
          id: n.nodeId,
          skillName: n.skillName,
          displayName: n.displayName,
          description: '',
          nodeType: n.nodeType as DAGNode['nodeType'],
          dependsOn: n.dependsOn,
          parallelGroup: n.parallelGroup,
          gateType: n.gateType as DAGNode['gateType'],
          maxRetries: n.maxRetries,
          phaseIndex: n.phaseIndex,
        })),
      };

      await tx.pipelineRun.update({
        where: { id: runId },
        data: {
          executionPlan: JSON.parse(JSON.stringify(updatedPlan)),
        },
      });
    });

    console.log(
      `[GraphExpander] Expanded DAG for run ${runId}: ` +
      `${phases.length} phases → ${newNodes.length} new nodes ` +
      `(removed ${toRemove.length} placeholders)`
    );

    return { nodesCreated: newNodes.length };
  }
}
