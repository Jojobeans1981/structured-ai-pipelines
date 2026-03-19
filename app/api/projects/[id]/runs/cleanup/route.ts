import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Delete all failed, cancelled, and planning runs
  const result = await prisma.pipelineRun.deleteMany({
    where: {
      projectId: params.id,
      status: { in: ['failed', 'cancelled', 'planning'] },
    },
  });

  console.log(`[POST /runs/cleanup] Deleted ${result.count} failed/cancelled runs for project ${params.id}`);

  return NextResponse.json({ data: { deleted: result.count } });
}
