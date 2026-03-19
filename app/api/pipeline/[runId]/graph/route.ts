import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: {
      stages: { orderBy: { stageIndex: 'asc' } },
      project: { select: { userId: true } },
    },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const nodes = run.stages.map((s) => ({
    id: s.id,
    nodeId: s.nodeId,
    stageIndex: s.stageIndex,
    skillName: s.skillName,
    displayName: s.displayName,
    status: s.status,
    nodeType: s.nodeType,
    dependsOn: s.dependsOn,
    parallelGroup: s.parallelGroup,
    gateType: s.gateType,
    phaseIndex: s.phaseIndex,
    durationMs: s.durationMs,
    retryCount: s.retryCount,
    artifactContent: s.artifactContent,
  }));

  return NextResponse.json({
    data: {
      runId: run.id,
      executionMode: run.executionMode,
      executionPlan: run.executionPlan,
      planApproved: run.planApproved,
      outputPath: run.outputPath,
      status: run.status,
      nodes,
    },
  });
}
