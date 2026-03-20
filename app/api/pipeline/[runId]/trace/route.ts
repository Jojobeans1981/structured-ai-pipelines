import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { TraceLogger } from '@/src/services/trace-logger';
import { prisma } from '@/src/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  // Verify ownership
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: { project: { select: { userId: true } } },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [events, votes, spanTree] = await Promise.all([
    TraceLogger.getTraceEvents(params.runId),
    TraceLogger.getAgentVotes(params.runId),
    TraceLogger.getSpanTree(params.runId),
  ]);

  return NextResponse.json({
    data: {
      traceId: run.traceId,
      events,
      votes,
      spanTree,
      summary: {
        totalEvents: (events as unknown[]).length,
        totalVotes: (votes as unknown[]).length,
        agentDecisions: (votes as unknown[]).length > 0
          ? [...new Set((votes as Array<{ stageId: string }>).map((v) => v.stageId))].length
          : 0,
      },
    },
  });
}
