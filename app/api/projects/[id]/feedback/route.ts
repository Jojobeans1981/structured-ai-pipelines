import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { z } from 'zod';

interface Props {
  params: { id: string };
}

const feedbackSchema = z.object({
  rating: z.number().min(1).max(2), // 1 = thumbs down, 2 = thumbs up
  comment: z.string().optional(),
  workedOutOfBox: z.boolean().optional(),
  runId: z.string().optional(),
});

/**
 * POST /api/projects/[id]/feedback — Submit feedback after download.
 */
export async function POST(request: Request, { params }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid feedback', details: parsed.error.flatten() }, { status: 400 });
  }

  const feedback = await prisma.projectFeedback.create({
    data: {
      projectId: params.id,
      userId: user.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
      workedOutOfBox: parsed.data.workedOutOfBox ?? false,
      runId: parsed.data.runId || null,
    },
  });

  // If negative feedback, record in learning store for future improvement
  if (parsed.data.rating === 1 && parsed.data.comment) {
    try {
      const { LearningStore } = await import('@/src/services/learning-store');
      await LearningStore.recordRejection(
        'user-feedback',
        'phase-executor',
        `User reported: ${parsed.data.comment.substring(0, 200)}`,
        parsed.data.runId || undefined
      );
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ data: feedback });
}

/**
 * GET /api/projects/[id]/feedback — Get feedback for a project.
 */
export async function GET(_request: Request, { params }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const feedback = await prisma.projectFeedback.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: feedback });
}
