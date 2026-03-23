import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { getAnthropicClient } from '@/src/lib/anthropic';
import { IntakeAgent } from '@/src/services/intake-agent';
import { DAGExecutor } from '@/src/services/dag-executor';
import { type ExecutionPlan } from '@/src/types/dag';

export const maxDuration = 60;

/**
 * POST /api/pipeline/[runId]/rerun
 * Create a new run with the same input/type/settings as the given run.
 */
export async function POST(
  _req: Request,
  { params }: { params: { runId: string } },
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const originalRun = await prisma.pipelineRun.findUnique({
      where: { id: params.runId },
      include: { project: { select: { id: true, userId: true } } },
    });

    if (!originalRun) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    if (originalRun.project.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const autoApprove = originalRun.autoApprove;

    // Create new run with same params
    const newRun = await prisma.pipelineRun.create({
      data: {
        projectId: originalRun.project.id,
        type: originalRun.type,
        status: autoApprove ? 'running' : 'planning',
        userInput: originalRun.userInput,
        currentStageIndex: 0,
        executionMode: 'dag',
        autoApprove,
        planApproved: autoApprove,
      },
    });

    // Generate plan
    let plan: ExecutionPlan;
    try {
      const client = await getAnthropicClient(user.id);
      plan = await IntakeAgent.generatePlan(originalRun.userInput, client);
    } catch (err) {
      console.warn('[POST /pipeline/rerun] Intake agent failed, using default plan:', err);
      plan = IntakeAgent.defaultBuildPlan(3);
    }

    await DAGExecutor.createStagesFromPlan(newRun.id, plan);

    if (autoApprove) {
      const advanced = await DAGExecutor.advanceDAG(newRun.id);
      console.log(`[POST /pipeline/rerun] Auto-approve: ${advanced.readyNodes.length} nodes ready`);
    }

    const fullRun = await prisma.pipelineRun.findUnique({
      where: { id: newRun.id },
      include: { stages: { orderBy: { stageIndex: 'asc' } } },
    });

    return NextResponse.json({ data: fullRun }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /pipeline/rerun]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
