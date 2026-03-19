import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { StageExecutor } from '@/src/services/stage-executor';
import { FileManager, extractFilesFromArtifact } from '@/src/services/file-manager';
import { DiskWriter } from '@/src/services/disk-writer';
import { type ExecutionPlan, type DAGNode } from '@/src/types/dag';
import { GraphExpander } from '@/src/services/graph-expander';
import { MetricsService } from '@/src/services/metrics-service';
import { CostTracker, type TokenUsage } from '@/src/services/cost-tracker';

interface AdvanceResult {
  readyNodes: Array<{ id: string; nodeId: string; skillName: string; displayName: string; nodeType: string }>;
  runComplete: boolean;
  allApproved: boolean;
}

export class DAGExecutor {
  /**
   * Validate an execution plan for structural correctness.
   * Checks for: missing dependencies, circular references, empty graphs.
   */
  static validatePlan(plan: ExecutionPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(plan.nodes.map((n) => n.id));

    if (plan.nodes.length === 0) {
      errors.push('Execution plan has no nodes');
      return { valid: false, errors };
    }

    // Check all dependsOn references exist
    for (const node of plan.nodes) {
      for (const dep of node.dependsOn) {
        if (!nodeIds.has(dep)) {
          errors.push(`Node "${node.id}" depends on "${dep}" which does not exist`);
        }
      }
    }

    // Check for circular dependencies via topological sort
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const adjMap = new Map<string, string[]>();

    for (const node of plan.nodes) {
      adjMap.set(node.id, node.dependsOn);
    }

    function hasCycle(nodeId: string): boolean {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visiting.add(nodeId);
      for (const dep of adjMap.get(nodeId) || []) {
        if (hasCycle(dep)) return true;
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return false;
    }

    for (const node of plan.nodes) {
      if (hasCycle(node.id)) {
        errors.push(`Circular dependency detected involving node "${node.id}"`);
        break;
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Topological sort of DAG nodes. Returns layers where each layer
   * can execute concurrently.
   */
  static topologicalLayers(nodes: DAGNode[]): DAGNode[][] {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, node.dependsOn.length);
      if (!adjList.has(node.id)) adjList.set(node.id, []);
      for (const dep of node.dependsOn) {
        const existing = adjList.get(dep) || [];
        existing.push(node.id);
        adjList.set(dep, existing);
      }
    }

    const layers: DAGNode[][] = [];
    const remaining = new Set(nodes.map((n) => n.id));

    while (remaining.size > 0) {
      const layer: DAGNode[] = [];
      for (const id of remaining) {
        if ((inDegree.get(id) || 0) === 0) {
          layer.push(nodeMap.get(id)!);
        }
      }

      if (layer.length === 0) {
        console.error('[DAGExecutor] Stuck — remaining nodes have unresolved dependencies');
        break;
      }

      layers.push(layer);

      for (const node of layer) {
        remaining.delete(node.id);
        for (const child of adjList.get(node.id) || []) {
          inDegree.set(child, (inDegree.get(child) || 1) - 1);
        }
      }
    }

    return layers;
  }

  /**
   * Create PipelineStage records from an execution plan.
   * Called after the intake agent generates the plan.
   */
  static async createStagesFromPlan(runId: string, plan: ExecutionPlan): Promise<void> {
    const layers = DAGExecutor.topologicalLayers(plan.nodes);
    let stageIndex = 0;

    await prisma.$transaction(async (tx) => {
      for (const layer of layers) {
        for (const node of layer) {
          await tx.pipelineStage.create({
            data: {
              runId,
              stageIndex,
              skillName: node.skillName || '__gate__',
              displayName: node.displayName,
              status: 'pending',
              dependsOn: node.dependsOn,
              nodeType: node.nodeType,
              parallelGroup: node.parallelGroup,
              gateType: node.gateType,
              maxRetries: node.maxRetries,
              phaseIndex: node.phaseIndex,
              nodeId: node.id,
            },
          });
          stageIndex++;
        }
      }

      await tx.pipelineRun.update({
        where: { id: runId },
        data: {
          executionPlan: JSON.parse(JSON.stringify(plan)),
          executionMode: 'dag',
        },
      });
    });

    console.log(`[DAGExecutor] Created ${stageIndex} stages from plan for run ${runId}`);
  }

  /**
   * Get all nodes that are ready to execute (dependencies satisfied, status pending).
   */
  static async getReadyNodes(runId: string): Promise<AdvanceResult> {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        stages: { orderBy: { stageIndex: 'asc' } },
      },
    });

    if (!run) throw new Error(`Run not found: ${runId}`);

    const stages = run.stages;
    const approvedNodeIds = new Set(
      stages.filter((s) => s.status === 'approved').map((s) => s.nodeId).filter(Boolean)
    );

    const allApproved = stages.every(
      (s) => s.status === 'approved' || s.status === 'skipped'
    );

    if (allApproved) {
      return { readyNodes: [], runComplete: true, allApproved: true };
    }

    const readyNodes: AdvanceResult['readyNodes'] = [];

    for (const stage of stages) {
      if (stage.status !== 'pending') continue;

      // Check if all dependencies are approved
      const depsResolved = stage.dependsOn.every((depId) => approvedNodeIds.has(depId));
      if (depsResolved) {
        readyNodes.push({
          id: stage.id,
          nodeId: stage.nodeId || stage.id,
          skillName: stage.skillName,
          displayName: stage.displayName,
          nodeType: stage.nodeType,
        });
      }
    }

    return { readyNodes, runComplete: false, allApproved: false };
  }

  /**
   * Advance the DAG: mark ready nodes as running and return them.
   * Called after a node is approved or after plan approval.
   */
  static async advanceDAG(runId: string): Promise<AdvanceResult> {
    const result = await DAGExecutor.getReadyNodes(runId);

    if (result.runComplete) {
      const now = new Date();
      const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
      if (run) {
        const totalDurationMs = now.getTime() - run.startedAt.getTime();
        await prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: 'completed', completedAt: now, totalDurationMs },
        });
        console.log(`[DAGExecutor] Run ${runId} completed (${totalDurationMs}ms)`);

        // Collect metrics after completion
        try {
          await MetricsService.collectMetrics(runId);
        } catch (err) {
          console.error('[DAGExecutor] Metrics collection failed (non-fatal):', err);
        }
      }
      return result;
    }

    // Mark ready nodes as running
    for (const node of result.readyNodes) {
      if (node.nodeType === 'gate') {
        // Gates go straight to awaiting_approval
        await prisma.pipelineStage.update({
          where: { id: node.id },
          data: { status: 'awaiting_approval', startedAt: new Date() },
        });
        console.log(`[DAGExecutor] Gate "${node.displayName}" awaiting approval`);
      } else {
        await prisma.pipelineStage.update({
          where: { id: node.id },
          data: { status: 'running', startedAt: new Date() },
        });
        console.log(`[DAGExecutor] Started node "${node.displayName}"`);
      }
    }

    return result;
  }

  /**
   * Build context for a DAG node by gathering artifacts from its dependencies.
   */
  static async getNodeContext(runId: string, nodeId: string): Promise<{ context: string; previousArtifacts: string[] }> {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        stages: { orderBy: { stageIndex: 'asc' } },
      },
    });

    if (!run) throw new Error(`Run not found: ${runId}`);

    const currentStage = run.stages.find((s) => s.id === nodeId || s.nodeId === nodeId);
    if (!currentStage) throw new Error(`Node not found: ${nodeId}`);

    const parts: string[] = [`## User Input\n\n${run.userInput}`];
    const previousArtifacts: string[] = [];

    // Get artifacts from dependency nodes only (not all prior stages)
    const depNodeIds = new Set(currentStage.dependsOn);
    const depStages = run.stages.filter(
      (s) => depNodeIds.has(s.nodeId || '') && s.status === 'approved' && s.artifactContent
    );

    for (const stage of depStages) {
      parts.push(
        `## ${stage.displayName} (dependency)\n\n${stage.artifactContent}`
      );
      previousArtifacts.push(stage.artifactContent!);
    }

    // Include user feedback if this is a re-run
    if (currentStage.userFeedback) {
      if (currentStage.streamContent) {
        parts.push(
          `## Previous Stage Output\n\nYou previously generated this output:\n\n${currentStage.streamContent}`
        );
      }
      parts.push(
        `## User Response\n\n${currentStage.userFeedback}\n\nProceed with this information. Do NOT re-ask questions already answered.`
      );
    }

    return {
      context: parts.join('\n\n---\n\n'),
      previousArtifacts,
    };
  }

  /**
   * Execute a single node. Returns an async generator of tokens for streaming.
   */
  static async *executeNode(
    runId: string,
    stageId: string,
    client: Anthropic,
    signal?: AbortSignal
  ): AsyncGenerator<string, string, undefined> {
    const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
    if (!stage) throw new Error(`Stage not found: ${stageId}`);

    if (stage.nodeType === 'gate') {
      return 'Awaiting human approval.';
    }

    if (stage.nodeType === 'verify') {
      // Build verification is handled separately by BuildVerifier
      return 'Build verification pending.';
    }

    // Skill and agent nodes use StageExecutor
    const { context, previousArtifacts } = await DAGExecutor.getNodeContext(runId, stageId);

    // Inject pipeline override for executor skills — don't wait for confirmation
    let finalContext = context;
    if (stage.skillName === 'phase-executor' || stage.skillName === 'fix-executor') {
      finalContext += '\n\n---\n\n## PIPELINE EXECUTION MODE\n\n' +
        'You are running inside an automated pipeline. Do NOT ask "shall I proceed?" or wait for confirmation. ' +
        'Execute ALL prompts in sequence immediately. Generate ALL code for every file. ' +
        'Do not stop after describing what you will do — actually do it. ' +
        'Output complete file contents in code blocks with the filename in the heading or code fence. ' +
        'Every file must be complete and runnable, not abbreviated or truncated.';
    }

    const executor = new StageExecutor(client);
    const generator = executor.executeStage(
      stage.skillName,
      finalContext,
      previousArtifacts,
      signal
    );

    let fullText = '';
    for await (const token of generator) {
      fullText += token;
      yield token;
    }

    // Record token usage after stream completes
    if (executor.lastUsage) {
      try {
        await CostTracker.recordStageUsage(stageId, executor.lastUsage);
      } catch (err) {
        console.error('[DAGExecutor] Failed to record token usage (non-fatal):', err);
      }
    }

    return fullText;
  }

  /**
   * Handle node completion: extract files, update status, advance DAG.
   */
  static async completeNode(
    stageId: string,
    artifactContent: string,
    streamContent: string
  ): Promise<AdvanceResult> {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: stageId },
      include: { run: { select: { id: true, projectId: true, outputPath: true } } },
    });

    if (!stage) throw new Error(`Stage not found: ${stageId}`);

    const now = new Date();
    const durationMs = stage.startedAt ? now.getTime() - stage.startedAt.getTime() : null;

    // Update stage to awaiting_approval
    await prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        status: 'awaiting_approval',
        artifactContent,
        streamContent,
        completedAt: now,
        durationMs,
      },
    });

    // Extract files for executor stages — save to DB AND disk
    if (stage.skillName === 'phase-executor' || stage.skillName === 'fix-executor') {
      try {
        // Save to database
        const count = await FileManager.extractAndSaveFiles(
          stageId, stage.runId, stage.run.projectId, artifactContent
        );
        console.log(`[DAGExecutor] Extracted ${count} files to DB from "${stage.displayName}"`);

        // Write to disk if outputPath is set
        if (stage.run.outputPath) {
          const extracted = extractFilesFromArtifact(artifactContent);
          const diskCount = DiskWriter.writeArtifactFiles(
            stage.run.outputPath,
            extracted.map((f) => ({ filePath: f.filePath, content: f.content }))
          );
          console.log(`[DAGExecutor] Wrote ${diskCount} files to disk at ${stage.run.outputPath}`);
        }
      } catch (err) {
        console.error('[DAGExecutor] File extraction/write failed (non-fatal):', err);
      }
    }

    console.log(`[DAGExecutor] Node "${stage.displayName}" complete (${durationMs}ms), awaiting approval`);

    // Don't advance yet — wait for human approval
    return { readyNodes: [], runComplete: false, allApproved: false };
  }

  /**
   * Approve a node and advance the DAG to find next ready nodes.
   */
  static async approveNode(stageId: string, editedContent?: string): Promise<AdvanceResult> {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: stageId },
      include: { run: true },
    });

    if (!stage) throw new Error(`Stage not found: ${stageId}`);

    const updateData: Record<string, unknown> = {
      status: 'approved',
      approvedAt: new Date(),
    };

    if (editedContent !== undefined) {
      updateData.artifactContent = editedContent;
    }

    await prisma.pipelineStage.update({
      where: { id: stageId },
      data: updateData,
    });

    console.log(`[DAGExecutor] Node "${stage.displayName}" approved`);

    // Dynamic graph expansion: if this is a phase-builder node, expand the DAG
    if (stage.skillName === 'phase-builder') {
      const content = editedContent || stage.artifactContent;
      if (content) {
        try {
          const { nodesCreated } = await GraphExpander.expandAfterPhaseBuilder(
            stage.runId, stage.id, content
          );
          console.log(`[DAGExecutor] Graph expanded with ${nodesCreated} new nodes`);
        } catch (err) {
          console.error('[DAGExecutor] Graph expansion failed:', err);
        }
      }
    }

    // Advance the DAG to find next ready nodes
    return DAGExecutor.advanceDAG(stage.runId);
  }

  /**
   * Reject a node with feedback and reset it for re-execution.
   */
  static async rejectNode(stageId: string, feedback: string): Promise<void> {
    const current = await prisma.pipelineStage.findUnique({
      where: { id: stageId },
      select: { artifactContent: true, streamContent: true, retryCount: true, displayName: true },
    });

    const previousOutput = current?.artifactContent || current?.streamContent || null;

    await prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        status: 'running',
        startedAt: new Date(),
        completedAt: null,
        approvedAt: null,
        durationMs: null,
        artifactContent: null,
        streamContent: previousOutput,
        userFeedback: feedback,
        retryCount: (current?.retryCount || 0) + 1,
      },
    });

    console.log(`[DAGExecutor] Node "${current?.displayName}" rejected with feedback, re-running`);
  }
}
