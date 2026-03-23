import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/src/lib/prisma';
import { StageExecutor } from '@/src/services/stage-executor';
import { FileManager, extractFilesFromArtifact } from '@/src/services/file-manager';
import { DiskWriter } from '@/src/services/disk-writer';
import { type ExecutionPlan, type DAGNode } from '@/src/types/dag';
import { GraphExpander } from '@/src/services/graph-expander';
import { MetricsService } from '@/src/services/metrics-service';
import { CostTracker, type TokenUsage } from '@/src/services/cost-tracker';
import { TraceLogger } from '@/src/services/trace-logger';
import { AgentCoordinator } from '@/src/services/agent-coordinator';
import { OutputValidator } from '@/src/services/output-validator';
import { SecretScanner } from '@/src/services/secret-scanner';
import { SentinelAgent } from '@/src/services/sentinel-agent';
import { InspectorAgent } from '@/src/services/inspector-agent';
import { LearningStore } from '@/src/services/learning-store';

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

      const traceId = TraceLogger.generateTraceId();
      await tx.pipelineRun.update({
        where: { id: runId },
        data: {
          executionPlan: JSON.parse(JSON.stringify(plan)),
          executionMode: 'dag',
          traceId,
        },
      });
    });

    console.log(`[DAGExecutor] Created ${stageIndex} stages from plan for run ${runId}`);

    // Log pipeline start
    const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { traceId: true, userInput: true } });
    if (run?.traceId) {
      await TraceLogger.pipelineStart(runId, run.traceId, run.userInput);
    }
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
      const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { id: true, startedAt: true, traceId: true } });
      if (run) {
        const totalDurationMs = now.getTime() - run.startedAt.getTime();
        await prisma.pipelineRun.update({
          where: { id: runId },
          data: { status: 'completed', completedAt: now, totalDurationMs },
        });
        console.log(`[DAGExecutor] Run ${runId} completed (${totalDurationMs}ms)`);

        // Log pipeline completion
        if (run.traceId) {
          await TraceLogger.pipelineComplete(runId, run.traceId, run.traceId, totalDurationMs, 'completed');
        }

        // Collect metrics after completion
        try {
          await MetricsService.collectMetrics(runId);
        } catch (err) {
          console.error('[DAGExecutor] Metrics collection failed (non-fatal):', err);
        }

        // Promote run files to baseline (runId=null) so future diagnostics can see them
        try {
          const runWithProject = await prisma.pipelineRun.findUnique({
            where: { id: runId },
            select: { projectId: true, type: true },
          });
          if (runWithProject && runWithProject.type === 'build') {
            const runFiles = await prisma.projectFile.findMany({
              where: { runId },
              select: { filePath: true, content: true, language: true },
            });
            for (const file of runFiles) {
              await prisma.projectFile.upsert({
                where: {
                  projectId_filePath: { projectId: runWithProject.projectId, filePath: file.filePath },
                },
                create: {
                  projectId: runWithProject.projectId,
                  filePath: file.filePath,
                  content: file.content,
                  language: file.language,
                  // runId: null = baseline file
                },
                update: {
                  content: file.content,
                  language: file.language,
                },
              });
            }
            console.log(`[DAGExecutor] Promoted ${runFiles.length} files to baseline for project ${runWithProject.projectId}`);
          }
        } catch (err) {
          console.error('[DAGExecutor] File promotion to baseline failed (non-fatal):', err);
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

    // For enhance/diagnostic/refactor: include existing project files as context
    if (['diagnostic', 'enhance', 'refactor', 'test'].includes(run.type)) {
      // First try baseline files (uploaded via /upload endpoint)
      let existingFiles = await prisma.projectFile.findMany({
        where: { projectId: run.projectId, runId: null },
        select: { filePath: true, content: true },
        take: 50,
      });

      // If no baseline files, grab the latest files from ANY completed run on this project
      if (existingFiles.length === 0) {
        const latestRun = await prisma.pipelineRun.findFirst({
          where: {
            projectId: run.projectId,
            status: 'completed',
            id: { not: run.id },
          },
          orderBy: { completedAt: 'desc' },
          select: { id: true },
        });

        if (latestRun) {
          existingFiles = await prisma.projectFile.findMany({
            where: { projectId: run.projectId, runId: latestRun.id },
            select: { filePath: true, content: true },
            take: 50,
          });
          if (existingFiles.length > 0) {
            console.log(`[DAGExecutor] No baseline files — using ${existingFiles.length} files from last completed run ${latestRun.id}`);
          }
        }
      }

      // Last resort: grab ANY files for this project regardless of runId
      if (existingFiles.length === 0) {
        existingFiles = await prisma.projectFile.findMany({
          where: { projectId: run.projectId },
          select: { filePath: true, content: true },
          orderBy: { updatedAt: 'desc' },
          take: 50,
        });
        if (existingFiles.length > 0) {
          console.log(`[DAGExecutor] Using ${existingFiles.length} files from any source for project context`);
        }
      }

      if (existingFiles.length > 0) {
        let codeContext = '## Existing Project Code\n\nThe following files are the current codebase you are working with:\n\n';
        for (const file of existingFiles) {
          // Truncate large files to keep context manageable
          const truncated = file.content.length > 5000
            ? file.content.substring(0, 5000) + '\n\n... (truncated)'
            : file.content;
          codeContext += `### ${file.filePath}\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
        }
        parts.push(codeContext);
      }
    }

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
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: stageId },
      include: { run: { select: { traceId: true } } },
    });
    if (!stage) throw new Error(`Stage not found: ${stageId}`);

    const traceId = stage.run?.traceId || 'unknown';
    const spanId = await TraceLogger.stageStart(runId, traceId, stageId, stage.displayName);

    if (stage.nodeType === 'gate') {
      await TraceLogger.log({
        runId, traceId, spanId,
        eventType: 'gate_awaiting',
        source: 'dag-executor',
        message: `Gate "${stage.displayName}" awaiting approval`,
      });
      return 'Awaiting human approval.';
    }

    if (stage.nodeType === 'verify') {
      return 'Build verification pending.';
    }

    // Skill and agent nodes use StageExecutor
    const { context, previousArtifacts } = await DAGExecutor.getNodeContext(runId, stageId);

    // Inject Foreman warnings from learning store
    let finalContext = context;
    try {
      const warnings = await LearningStore.getWarningBlock(stage.skillName);
      if (warnings) finalContext += warnings;
    } catch { /* non-fatal */ }

    // Inject comprehensiveness instruction for phase-builder (Groq/Llama needs this)
    if (stage.skillName === 'phase-builder') {
      finalContext += '\n\n---\n\n## CRITICAL: COMPREHENSIVE OUTPUT REQUIRED\n\n' +
        'You MUST produce AT LEAST 3 separate phases (Phase 0 through Phase 2 minimum). ' +
        'Phase 0 should ALWAYS be project scaffolding (package.json, config files, directory structure). ' +
        'Subsequent phases should cover the ACTUAL FEATURES described in the PRD. ' +
        'Each phase MUST have: Objective, Prerequisites, Deliverables, Technical Specification, and a Prompt Blueprint. ' +
        'Do NOT produce only a log initialization phase. The user needs a COMPLETE, BUILDABLE application. ' +
        'Output EVERY phase in full — do not abbreviate, truncate, or say "similar to above."';
    }

    // Inject comprehensiveness for prompt-builder too
    if (stage.skillName === 'prompt-builder') {
      finalContext += '\n\n---\n\n## CRITICAL: COMPLETE PROMPTS REQUIRED\n\n' +
        'Generate implementation prompts that include COMPLETE file contents. ' +
        'Every prompt must specify exact file paths and complete code — not pseudocode or outlines. ' +
        'The executor receiving this prompt has NO context beyond what you provide. ' +
        'Include package.json with all dependencies, config files, and every source file.';
    }

    // Inject pipeline override for executor skills — don't wait for confirmation
    if (stage.skillName === 'phase-executor' || stage.skillName === 'fix-executor') {
      // Extract tech stack from PRD context to enforce it
      const stackMatch = context.match(/(?:tech\s*stack|framework|language|runtime)[:\s]+([\s\S]{0,200})/i);
      const stackHint = stackMatch ? `\nThe tech stack specified in the PRD is: ${stackMatch[1].trim()}\n` : '';

      finalContext += '\n\n---\n\n## PIPELINE EXECUTION MODE\n\n' +
        'You are running inside an automated pipeline. Do NOT ask "shall I proceed?" or wait for confirmation. ' +
        'Execute ALL prompts in sequence immediately. Generate ALL code for every file. ' +
        'Do not stop after describing what you will do — actually do it. ' +
        'Output complete file contents in code blocks with the filename in the heading or code fence. ' +
        'Every file must be complete and runnable, not abbreviated or truncated.\n\n' +
        '## CRITICAL: TECH STACK ENFORCEMENT\n\n' +
        stackHint +
        'ONLY generate files that match the technology stack specified in the PRD. ' +
        'If the PRD says React/TypeScript, generate ONLY .ts, .tsx, .json, .css, .html files. ' +
        'NEVER generate .py, .rb, .java, .go, .rs or any language not in the specified stack. ' +
        'NEVER generate requirements.txt, setup.py, Pipfile, Gemfile, go.mod, Cargo.toml or similar. ' +
        'If you are unsure about the stack, look at the PRD and phase documents for guidance. ' +
        'Generating files in the wrong language is a critical error.';
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
    const stageStartTime = stage.startedAt?.getTime() || Date.now();
    const stageDuration = Date.now() - stageStartTime;

    if (executor.lastUsage) {
      try {
        await CostTracker.recordStageUsage(stageId, executor.lastUsage);
        const cost = CostTracker.calculateCost(executor.lastUsage);
        await TraceLogger.stageComplete(runId, traceId, spanId, stage.displayName, stageDuration, {
          input: executor.lastUsage.inputTokens,
          output: executor.lastUsage.outputTokens,
          cost,
        });
      } catch (err) {
        console.error('[DAGExecutor] Failed to record token usage (non-fatal):', err);
      }
    } else {
      await TraceLogger.stageComplete(runId, traceId, spanId, stage.displayName, stageDuration);
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
      include: { run: { select: { id: true, projectId: true, outputPath: true, autoApprove: true } } },
    });

    if (!stage) throw new Error(`Stage not found: ${stageId}`);

    const now = new Date();
    const durationMs = stage.startedAt ? now.getTime() - stage.startedAt.getTime() : null;
    const isAutoApprove = stage.run.autoApprove;

    // Update stage — auto-approve skips awaiting_approval
    await prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        status: isAutoApprove ? 'approved' : 'awaiting_approval',
        artifactContent,
        streamContent,
        completedAt: now,
        durationMs,
        ...(isAutoApprove ? { approvedAt: now } : {}),
      },
    });

    // Extract and validate files for executor stages
    if (stage.skillName === 'phase-executor' || stage.skillName === 'fix-executor') {
      try {
        // Get PRD context for tech stack validation
        const prdStage = await prisma.pipelineStage.findFirst({
          where: { runId: stage.runId, skillName: 'prd-architect', status: 'approved' },
          select: { artifactContent: true },
        });
        const prdContext = prdStage?.artifactContent || '';

        // Validate output matches tech stack
        const validation = OutputValidator.validate(artifactContent, prdContext);
        if (validation.errors.length > 0) {
          console.warn(`[DAGExecutor] Output validation warnings for "${stage.displayName}":`, validation.errors);
        }

        // Filter out wrong-stack files before saving
        let cleanedArtifact = artifactContent;
        if (validation.rejectedFiles.length > 0) {
          cleanedArtifact = OutputValidator.filterRejectedFiles(artifactContent, validation.rejectedFiles);
          console.log(`[DAGExecutor] Filtered ${validation.rejectedFiles.length} wrong-stack files: ${validation.rejectedFiles.join(', ')}`);

          // Update the artifact with cleaned content
          await prisma.pipelineStage.update({
            where: { id: stageId },
            data: { artifactContent: cleanedArtifact },
          });
        }

        // Save to database (using cleaned artifact)
        const count = await FileManager.extractAndSaveFiles(
          stageId, stage.runId, stage.run.projectId, cleanedArtifact
        );
        console.log(`[DAGExecutor] Extracted ${count} files to DB from "${stage.displayName}" (${validation.warnings.length} warnings, ${validation.rejectedFiles.length} rejected)`);

        // Secret scan on extracted files
        const extractedForScan = extractFilesFromArtifact(cleanedArtifact);
        const scanResult = SecretScanner.scan(extractedForScan);
        if (!scanResult.clean) {
          const scanReport = SecretScanner.formatResults(scanResult);
          await prisma.pipelineStage.update({
            where: { id: stageId },
            data: { artifactContent: (cleanedArtifact + scanReport) },
          });
          console.warn(`[DAGExecutor] Secret scan: ${scanResult.findings.length} findings in "${stage.displayName}"`);
        }

        // Write to disk if outputPath is set
        if (stage.run.outputPath) {
          const extracted = extractFilesFromArtifact(cleanedArtifact);
          const diskCount = DiskWriter.writeArtifactFiles(
            stage.run.outputPath,
            extracted.map((f) => ({ filePath: f.filePath, content: f.content }))
          );
          console.log(`[DAGExecutor] Wrote ${diskCount} files to disk at ${stage.run.outputPath}`);
        }
      } catch (err) {
        console.error('[DAGExecutor] File extraction/validation failed (non-fatal):', err);
      }
    }

    // Run Sentinel on prompt-builder output (confidence check before execution)
    if (stage.skillName === 'prompt-builder') {
      try {
        const prdStage = await prisma.pipelineStage.findFirst({
          where: { runId: stage.runId, skillName: 'prd-architect', status: 'approved' },
          select: { artifactContent: true },
        });
        const phaseStage = await prisma.pipelineStage.findFirst({
          where: { runId: stage.runId, skillName: 'phase-builder', status: 'approved' },
          select: { artifactContent: true },
        });
        const priorArtifacts = await prisma.pipelineStage.findMany({
          where: { runId: stage.runId, status: 'approved', stageIndex: { lt: stage.stageIndex } },
          select: { artifactContent: true },
          orderBy: { stageIndex: 'asc' },
        });

        // We need a client — use Groq for cheap evaluation
        const { getAnthropicClient } = await import('@/src/lib/anthropic');
        const run = await prisma.pipelineRun.findUnique({
          where: { id: stage.runId },
          include: { project: { select: { userId: true } } },
        });
        if (run) {
          const evalClient = await getAnthropicClient(run.project.userId);
          const sentinelResult = await SentinelAgent.evaluate(
            stage.runId,
            stageId,
            artifactContent,
            phaseStage?.artifactContent || '',
            prdStage?.artifactContent || '',
            priorArtifacts.map((a) => a.artifactContent || '').filter(Boolean),
            evalClient
          );

          // Append Sentinel verdict to the artifact so user sees it
          const verdict = sentinelResult.passed
            ? `\n\n---\n\n✅ **Sentinel Verdict: ${(sentinelResult.score * 100).toFixed(0)}% confidence — PASSED**\n${sentinelResult.reasoning}`
            : `\n\n---\n\n❌ **Sentinel Verdict: ${(sentinelResult.score * 100).toFixed(0)}% confidence — BELOW THRESHOLD (${(SentinelAgent.getThreshold() * 100).toFixed(0)}%)**\n${sentinelResult.reasoning}\n\n**Issues:**\n${sentinelResult.issues.map((i) => `- ${i}`).join('\n')}\n\n**Suggestions:**\n${sentinelResult.suggestions.map((s) => `- ${s}`).join('\n')}`;

          await prisma.pipelineStage.update({
            where: { id: stageId },
            data: { artifactContent: artifactContent + verdict },
          });

          // If rejected, record in learning store AND auto-reject the stage
          if (!sentinelResult.passed) {
            for (const issue of sentinelResult.issues) {
              await LearningStore.recordRejection(
                'sentinel', 'prompt-builder', issue, stage.runId, stageId
              ).catch(() => {});
            }
          } else {
            // Sentinel passed — resolve any active patterns for prompt-builder
            const activePatterns = await prisma.learningEntry.findMany({
              where: { status: 'active', targetAgent: 'prompt-builder', sourceAgent: 'sentinel' },
            });
            for (const p of activePatterns) {
              await LearningStore.resolve(
                p.id,
                `Resolved: Sentinel passed for stage ${stage.displayName} in run ${stage.runId}`
              ).catch(() => {});
            }
            if (activePatterns.length > 0) {
              console.log(`[DAGExecutor] Resolved ${activePatterns.length} sentinel patterns after pass`);
            }

            // Auto-reject: reset stage for re-generation with Sentinel feedback
            const feedback = `SENTINEL REJECTION (${(sentinelResult.score * 100).toFixed(0)}% < ${(SentinelAgent.getThreshold() * 100).toFixed(0)}% threshold):\n\n` +
              `Issues:\n${sentinelResult.issues.map((i) => `- ${i}`).join('\n')}\n\n` +
              `Suggestions:\n${sentinelResult.suggestions.map((s) => `- ${s}`).join('\n')}\n\n` +
              `Fix these issues and regenerate the prompts.`;

            if (stage.retryCount < stage.maxRetries) {
              console.log(`[DAGExecutor] Sentinel auto-rejecting "${stage.displayName}" (attempt ${stage.retryCount + 1}/${stage.maxRetries})`);
              await DAGExecutor.rejectNode(stageId, feedback);
              return { readyNodes: [{ id: stageId, nodeId: stage.nodeId || stageId, skillName: stage.skillName, displayName: stage.displayName, nodeType: stage.nodeType }], runComplete: false, allApproved: false };
            }
            // Max retries exceeded — let human decide
            console.warn(`[DAGExecutor] Sentinel rejected but max retries reached — presenting to human`);
          }
        }
      } catch (err) {
        console.error('[DAGExecutor] Sentinel evaluation failed (non-fatal):', err);
      }
    }

    // Enrich trace metadata with audit info
    const run = await prisma.pipelineRun.findUnique({
      where: { id: stage.runId },
      select: { traceId: true },
    });
    if (run?.traceId) {
      const fileCount = await prisma.projectFile.count({ where: { runId: stage.runId } });
      await TraceLogger.log({
        runId: stage.runId,
        traceId: run.traceId,
        spanId: TraceLogger.generateSpanId(),
        eventType: 'stage_complete',
        source: 'dag-executor',
        message: `Node "${stage.displayName}" complete (${durationMs}ms)`,
        metadata: {
          artifactSize: artifactContent.length,
          fileCount,
          skillName: stage.skillName,
          retryCount: stage.retryCount,
        } as Record<string, string | number | boolean | null>,
        durationMs: durationMs ?? undefined,
      });
    }

    if (isAutoApprove) {
      console.log(`[DAGExecutor] Node "${stage.displayName}" auto-approved (${durationMs}ms), advancing DAG`);

      // Run graph expansion for phase-builder (same as approveNode)
      if (stage.skillName === 'phase-builder') {
        try {
          const { GraphExpander } = await import('@/src/services/graph-expander');
          const { nodesCreated } = await GraphExpander.expandAfterPhaseBuilder(
            stage.runId, stage.id, artifactContent
          );
          console.log(`[DAGExecutor] Auto-approve: graph expanded with ${nodesCreated} new nodes`);
        } catch (err) {
          console.error('[DAGExecutor] Auto-approve graph expansion failed:', err);
        }
      }

      return DAGExecutor.advanceDAG(stage.runId);
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
      include: { run: { select: { id: true, traceId: true } } },
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

    // Trace logging
    if (stage.run?.traceId) {
      const spanId = TraceLogger.generateSpanId();
      await TraceLogger.gateApproved(stage.run.id, stage.run.traceId, spanId, stage.displayName);
    }

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

    // Run Inspector after phase-executor approval (verify completeness)
    if (stage.skillName === 'phase-executor' && stage.phaseIndex !== null) {
      try {
        const { getAnthropicClient } = await import('@/src/lib/anthropic');
        const run = await prisma.pipelineRun.findUnique({
          where: { id: stage.runId },
          include: { project: { select: { userId: true } } },
        });
        if (run) {
          const inspClient = await getAnthropicClient(run.project.userId);
          const inspResult = await InspectorAgent.verify(stage.runId, stage.phaseIndex!, inspClient);

          if (!inspResult.passed) {
            console.warn(`[DAGExecutor] Inspector: Phase ${stage.phaseIndex} incomplete — ${inspResult.failures.length} failures`);
            // Record failures in learning store
            for (const failure of inspResult.failures) {
              await LearningStore.recordRejection(
                'inspector', 'phase-executor',
                `Phase ${stage.phaseIndex}: ${failure.criterion} — ${failure.reason}`,
                stage.runId, stageId
              ).catch(() => {});
            }
          } else {
            // Inspector passed — resolve any active patterns for this phase
            console.log(`[DAGExecutor] Inspector: Phase ${stage.phaseIndex} passed — resolving active patterns`);
            const activePatterns = await prisma.learningEntry.findMany({
              where: {
                status: 'active',
                targetAgent: 'phase-executor',
                pattern: { startsWith: `Phase ${stage.phaseIndex}:` },
              },
            });
            for (const p of activePatterns) {
              await LearningStore.resolve(
                p.id,
                `Resolved: Inspector passed for phase ${stage.phaseIndex} in run ${stage.runId}`
              ).catch(() => {});
            }
            if (activePatterns.length > 0) {
              console.log(`[DAGExecutor] Resolved ${activePatterns.length} learning patterns for phase ${stage.phaseIndex}`);
            }
          }
        }
      } catch (err) {
        console.error('[DAGExecutor] Inspector verification failed (non-fatal):', err);
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
      select: { artifactContent: true, streamContent: true, retryCount: true, displayName: true, runId: true, run: { select: { traceId: true } } },
    });

    const previousOutput = current?.artifactContent || current?.streamContent || null;

    // Exponential backoff before retry: 1s, 2s, 4s, 8s... max 30s
    const backoffMs = Math.min(1000 * Math.pow(2, current?.retryCount || 0), 30000);
    console.log(`[DAGExecutor] Backoff ${backoffMs}ms before retry #${(current?.retryCount || 0) + 1}`);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

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

    // Trace logging
    if (current?.run?.traceId) {
      const spanId = TraceLogger.generateSpanId();
      await TraceLogger.gateRejected(current.runId, current.run.traceId, spanId, current.displayName || '', feedback);
    }
  }
}
