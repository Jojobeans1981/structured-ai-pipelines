import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { DAGExecutor } from '@/src/services/dag-executor';
import { DiskWriter } from '@/src/services/disk-writer';

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: {
      project: { select: { userId: true, name: true } },
    },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (run.planApproved) {
    return NextResponse.json({ error: 'Plan already approved' }, { status: 400 });
  }

  // Initialize output directory for disk writing
  const outputPath = DiskWriter.initOutputDir(run.project.name, run.id);

  // Mark plan as approved and set output path
  await prisma.pipelineRun.update({
    where: { id: params.runId },
    data: {
      planApproved: true,
      outputPath,
      status: 'running',
    },
  });

  // Advance DAG to find first ready nodes
  const result = await DAGExecutor.advanceDAG(params.runId);

  return NextResponse.json({
    data: {
      approved: true,
      outputPath,
      nextNodes: result.readyNodes,
    },
  });
}
