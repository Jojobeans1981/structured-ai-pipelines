import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { DockerSandbox } from '@/src/services/docker-sandbox';

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

  const fileCount = await prisma.projectFile.count({
    where: { projectId: params.id },
  });
  const dockerAvailability = DockerSandbox.getAvailability();

  return NextResponse.json({
    livePreviewAvailable: dockerAvailability.available,
    livePreviewReason: dockerAvailability.reason,
    fallbackPreviewAvailable: fileCount > 0,
    fallbackUrl: `/projects/${params.id}/preview`,
  });
}

/**
 * POST /api/projects/[id]/preview — Launch a live preview container.
 * Returns a localhost URL that expires after 30 minutes.
 * Requires Docker to be available on the host.
 */
export async function POST(_request: Request, { params }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true, name: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const dockerAvailability = DockerSandbox.getAvailability();
  if (!dockerAvailability.available) {
    return NextResponse.json(
      {
        error: dockerAvailability.reason
          ? `Live preview requires Docker. ${dockerAvailability.reason}`
          : 'Docker is not available on this server. Live preview requires Docker.',
      },
      { status: 503 }
    );
  }

  // Get latest project files
  const projectFiles = await prisma.projectFile.findMany({
    where: { projectId: params.id },
    select: { filePath: true, content: true },
  });

  if (projectFiles.length === 0) {
    return NextResponse.json({ error: 'No files to preview' }, { status: 404 });
  }

  // Parse TTL from request body (default 30 min)
  let ttlSeconds = 1800;
  try {
    const body = await _request.json();
    if (body.ttlMinutes && typeof body.ttlMinutes === 'number') {
      ttlSeconds = Math.min(Math.max(body.ttlMinutes * 60, 60), 3600); // 1 min - 60 min
    }
  } catch { /* use default */ }

  const result = await DockerSandbox.launchPreview(projectFiles, ttlSeconds);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Failed to launch preview' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: result.url,
    containerId: result.containerId,
    port: result.port,
    expiresAt: result.expiresAt,
    ttlSeconds,
  });
}

/**
 * DELETE /api/projects/[id]/preview — Stop a running preview.
 */
export async function DELETE(request: Request, { params }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    if (body.containerId) {
      DockerSandbox.stopPreview(body.containerId);
    }
  } catch { /* ignore */ }

  return NextResponse.json({ stopped: true });
}
