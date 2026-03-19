import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { ZipGenerator } from '@/src/services/zip-generator';

interface Props {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true, name: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const zipBuffer = await ZipGenerator.generateZip(params.id);

  if (!zipBuffer) {
    return NextResponse.json({ error: 'No files to download' }, { status: 404 });
  }

  const safeName = project.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
    },
  });
}
