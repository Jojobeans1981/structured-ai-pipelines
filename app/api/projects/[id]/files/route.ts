import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { FileManager } from '@/src/services/file-manager';

interface Props {
  params: { id: string };
}

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

  const files = await FileManager.getProjectFiles(params.id);
  return NextResponse.json({ data: files });
}
