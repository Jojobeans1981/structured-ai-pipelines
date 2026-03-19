import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { PipelineEngine } from '@/src/services/pipeline-engine';
import { prisma } from '@/src/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const run = await PipelineEngine.getRunWithStages(params.runId);

    if (run.project.userId !== user.id) {
      return NextResponse.json(
        { error: 'Run not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: run });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GET /pipeline/[runId]]', message);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: { project: { select: { userId: true } } },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Cascade delete handles stages, files, metrics
  await prisma.pipelineRun.delete({ where: { id: params.runId } });

  console.log(`[DELETE /pipeline/${params.runId}] Run deleted`);
  return NextResponse.json({ success: true });
}
