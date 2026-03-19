import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { PipelineEngine } from '@/src/services/pipeline-engine';

export async function POST(
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

    if (run.status !== 'running' && run.status !== 'paused') {
      return NextResponse.json(
        { error: `Cannot cancel run with status: ${run.status}` },
        { status: 400 }
      );
    }

    const cancelledRun = await PipelineEngine.cancelRun(params.runId);

    return NextResponse.json({ data: cancelledRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /pipeline/[runId]/cancel]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
