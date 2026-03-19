import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { approveStageSchema } from '@/src/lib/validators';
import { PipelineEngine } from '@/src/services/pipeline-engine';
import { DAGExecutor } from '@/src/services/dag-executor';

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string; stageId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const parsed = approveStageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: params.stageId },
      include: {
        run: {
          include: {
            project: { select: { userId: true } },
          },
        },
      },
    });

    if (!stage || stage.runId !== params.runId) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    if (stage.run.project.userId !== user.id) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    if (stage.status !== 'awaiting_approval') {
      return NextResponse.json(
        { error: `Cannot approve stage with status: ${stage.status}` },
        { status: 400 }
      );
    }

    // Use DAG executor for DAG runs, linear engine for legacy runs
    if (stage.run.executionMode === 'dag') {
      const result = await DAGExecutor.approveNode(
        params.stageId,
        parsed.data?.editedContent
      );

      return NextResponse.json({
        data: {
          nextNodes: result.readyNodes,
          runComplete: result.runComplete,
        },
      });
    }

    // Legacy linear mode
    const result = await PipelineEngine.approveStage(
      params.stageId,
      parsed.data?.editedContent
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /stages/[stageId]/approve]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
