import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { updateProjectSchema } from '@/src/lib/validators';

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      runs: {
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          currentStageIndex: true,
          startedAt: true,
          completedAt: true,
          totalDurationMs: true,
        },
      },
      _count: { select: { files: true } },
    },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      fileCount: project._count.files,
      runs: project.runs.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        currentStageIndex: r.currentStageIndex,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        totalDurationMs: r.totalDurationMs,
      })),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  await prisma.project.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ data: { success: true } });
}
