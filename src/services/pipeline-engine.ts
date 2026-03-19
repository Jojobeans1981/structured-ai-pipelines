import { prisma } from '@/src/lib/prisma';
import {
  BUILD_PIPELINE_STAGES,
  DIAGNOSTIC_PIPELINE_STAGES,
  PipelineType,
} from '@/src/types/pipeline';
import { FileManager } from '@/src/services/file-manager';
import { MetricsService } from '@/src/services/metrics-service';

export class PipelineEngine {
  static async startRun(
    projectId: string,
    userId: string,
    type: PipelineType,
    input: string
  ) {
    const stageDefinitions =
      type === 'build' ? BUILD_PIPELINE_STAGES : DIAGNOSTIC_PIPELINE_STAGES;

    const run = await prisma.$transaction(async (tx) => {
      const newRun = await tx.pipelineRun.create({
        data: {
          projectId,
          type,
          status: 'running',
          userInput: input,
          currentStageIndex: 0,
        },
      });

      const stageData = stageDefinitions.map((def, index) => ({
        runId: newRun.id,
        stageIndex: index,
        skillName: def.skillName,
        displayName: def.displayName,
        status: index === 0 ? 'running' : 'pending',
        startedAt: index === 0 ? new Date() : null,
      }));

      await tx.pipelineStage.createMany({ data: stageData });

      return tx.pipelineRun.findUnique({
        where: { id: newRun.id },
        include: {
          stages: { orderBy: { stageIndex: 'asc' } },
        },
      });
    });

    console.log(
      `[PipelineEngine] Started ${type} run ${run!.id} with ${stageDefinitions.length} stages`
    );

    return run!;
  }

  static async getRunWithStages(runId: string) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        stages: { orderBy: { stageIndex: 'asc' } },
        project: { select: { id: true, userId: true, name: true } },
      },
    });

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    return run;
  }

  static async completeStage(
    stageId: string,
    artifactContent: string,
    streamContent: string
  ) {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: stageId },
    });

    if (!stage) {
      throw new Error(`Stage not found: ${stageId}`);
    }

    const now = new Date();
    const durationMs = stage.startedAt
      ? now.getTime() - stage.startedAt.getTime()
      : null;

    const updated = await prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        status: 'awaiting_approval',
        artifactContent,
        streamContent,
        completedAt: now,
        durationMs,
      },
    });

    console.log(
      `[PipelineEngine] Stage ${stageId} complete (${durationMs}ms), awaiting approval`
    );

    // Extract files from executor stages
    if (stage.skillName === 'phase-executor' || stage.skillName === 'fix-executor') {
      try {
        const run = await prisma.pipelineRun.findUnique({
          where: { id: stage.runId },
          select: { projectId: true },
        });
        if (run) {
          const count = await FileManager.extractAndSaveFiles(stageId, stage.runId, run.projectId, artifactContent);
          console.log(`[Pipeline] Extracted ${count} files from ${stage.skillName} output`);
        }
      } catch (err) {
        console.error('[Pipeline] File extraction failed (non-fatal):', err);
      }
    }

    return updated;
  }

  static async approveStage(stageId: string, editedContent?: string) {
    return prisma.$transaction(async (tx) => {
      const stage = await tx.pipelineStage.findUnique({
        where: { id: stageId },
        include: { run: { include: { stages: { orderBy: { stageIndex: 'asc' } } } } },
      });

      if (!stage) {
        throw new Error(`Stage not found: ${stageId}`);
      }

      const updateData: Record<string, unknown> = {
        status: 'approved',
        approvedAt: new Date(),
      };

      if (editedContent !== undefined) {
        updateData.artifactContent = editedContent;
      }

      await tx.pipelineStage.update({
        where: { id: stageId },
        data: updateData,
      });

      const totalStages = stage.run.stages.length;
      const nextIndex = stage.stageIndex + 1;
      const isLastStage = nextIndex >= totalStages;

      let nextStage = null;

      if (isLastStage) {
        const now = new Date();
        const totalDurationMs = now.getTime() - stage.run.startedAt.getTime();

        await tx.pipelineRun.update({
          where: { id: stage.runId },
          data: {
            status: 'completed',
            completedAt: now,
            totalDurationMs,
            currentStageIndex: stage.stageIndex,
          },
        });

        console.log(
          `[PipelineEngine] Run ${stage.runId} completed (${totalDurationMs}ms total)`
        );
      } else {
        nextStage = await tx.pipelineStage.update({
          where: {
            id: stage.run.stages[nextIndex].id,
          },
          data: {
            status: 'running',
            startedAt: new Date(),
          },
        });

        await tx.pipelineRun.update({
          where: { id: stage.runId },
          data: { currentStageIndex: nextIndex },
        });

        console.log(
          `[PipelineEngine] Advanced run ${stage.runId} to stage ${nextIndex}: ${nextStage.skillName}`
        );
      }

      // Collect metrics on completion
      if (isLastStage) {
        try {
          await MetricsService.collectMetrics(stage.runId);
        } catch (err) {
          console.error('[Pipeline] Metrics collection failed (non-fatal):', err);
        }
      }

      return { nextStage, runComplete: isLastStage };
    });
  }

  static async rejectStage(stageId: string, feedback: string) {
    // First read the current stage to preserve its output for context
    const current = await prisma.pipelineStage.findUnique({
      where: { id: stageId },
      select: { artifactContent: true, streamContent: true },
    });

    // Keep the previous output in streamContent so the re-run can reference
    // what Claude said (e.g., questions it asked) alongside the user's response
    const previousOutput = current?.artifactContent || current?.streamContent || null;

    const updated = await prisma.pipelineStage.update({
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
      },
    });

    console.log(
      `[PipelineEngine] Stage ${stageId} rejected with feedback, reset to running`
    );

    return updated;
  }

  static async cancelRun(runId: string) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.pipelineRun.findUnique({
        where: { id: runId },
        include: { stages: true },
      });

      if (!run) {
        throw new Error(`Run not found: ${runId}`);
      }

      await tx.pipelineStage.updateMany({
        where: {
          runId,
          status: { in: ['running', 'pending', 'awaiting_approval'] },
        },
        data: { status: 'skipped' },
      });

      const updatedRun = await tx.pipelineRun.update({
        where: { id: runId },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
        },
        include: {
          stages: { orderBy: { stageIndex: 'asc' } },
        },
      });

      console.log(`[PipelineEngine] Run ${runId} cancelled`);

      try {
        await MetricsService.collectMetrics(runId);
      } catch (err) {
        console.error('[Pipeline] Metrics collection failed (non-fatal):', err);
      }

      return updatedRun;
    });
  }

  static async getStageContext(runId: string, stageIndex: number): Promise<string> {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: {
        stages: {
          where: {
            stageIndex: { lte: stageIndex },
          },
          orderBy: { stageIndex: 'asc' },
        },
      },
    });

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const parts: string[] = [`## User Input\n\n${run.userInput}`];

    for (const stage of run.stages) {
      if (stage.stageIndex < stageIndex && stage.status === 'approved' && stage.artifactContent) {
        parts.push(
          `## Stage ${stage.stageIndex}: ${stage.displayName}\n\n${stage.artifactContent}`
        );
      }

      // Include the previous output + user feedback for re-runs (respond/reject)
      if (stage.stageIndex === stageIndex && stage.userFeedback) {
        // If there was a previous output (streamContent persists before reset in reject),
        // reconstruct the conversation so Claude sees what it asked and the user's answer
        if (stage.streamContent) {
          parts.push(
            `## Previous Stage Output\n\nYou previously generated this output for this stage:\n\n${stage.streamContent}`
          );
        }
        parts.push(
          `## User Response\n\nThe user responded to your output above with:\n\n${stage.userFeedback}\n\nNow proceed with this information. Do NOT re-ask questions that have already been answered above.`
        );
      }
    }

    return parts.join('\n\n---\n\n');
  }
}
