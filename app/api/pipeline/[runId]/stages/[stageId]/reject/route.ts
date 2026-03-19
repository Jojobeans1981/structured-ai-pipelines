import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { rejectStageSchema } from '@/src/lib/validators';
import { PipelineEngine } from '@/src/services/pipeline-engine';
import { DAGExecutor } from '@/src/services/dag-executor';

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string; stageId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const parsed = rejectStageSchema.safeParse(body);

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
      return NextResponse.json(
        { error: 'Stage not found' },
        { status: 404 }
      );
    }

    if (stage.run.project.userId !== user.id) {
      return NextResponse.json(
        { error: 'Stage not found' },
        { status: 404 }
      );
    }

    if (stage.status !== 'awaiting_approval') {
      return NextResponse.json(
        { error: `Cannot reject stage with status: ${stage.status}` },
        { status: 400 }
      );
    }

    if (stage.run.executionMode === 'dag') {
      await DAGExecutor.rejectNode(params.stageId, parsed.data.feedback);
      return NextResponse.json({ data: { status: 'running' } });
    }

    const updatedStage = await PipelineEngine.rejectStage(
      params.stageId,
      parsed.data.feedback
    );

    return NextResponse.json({ data: updatedStage });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /stages/[stageId]/reject]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
