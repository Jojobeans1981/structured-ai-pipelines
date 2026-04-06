import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const parsed = bulkDeleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const ids = Array.from(new Set(parsed.data.ids));

  const ownedProjects = await prisma.project.findMany({
    where: {
      userId: user.id,
      id: { in: ids },
    },
    select: { id: true },
  });

  if (ownedProjects.length !== ids.length) {
    return NextResponse.json(
      { error: 'One or more projects were not found.' },
      { status: 404 }
    );
  }

  const result = await prisma.project.deleteMany({
    where: {
      userId: user.id,
      id: { in: ids },
    },
  });

  return NextResponse.json({
    data: {
      success: true,
      deletedCount: result.count,
    },
  });
}
