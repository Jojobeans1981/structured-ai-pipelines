import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { CostTracker } from '@/src/services/cost-tracker';

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

  const data = await CostTracker.aggregateRunCost(params.runId);
  return NextResponse.json({ data });
}
