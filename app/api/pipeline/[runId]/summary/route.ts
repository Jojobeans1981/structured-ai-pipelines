import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { BuildSummary } from '@/src/services/build-summary';

export async function GET(
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

  try {
    const summary = await BuildSummary.generate(params.runId);
    return NextResponse.json({ data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
