import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { DockerSandbox } from '@/src/services/docker-sandbox';
import { PreviewWorkerClient } from '@/src/services/preview-worker-client';
import { PreviewSessionService } from '@/src/services/preview-session-service';

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
  const workerAvailability = dockerAvailability.available
    ? { available: false, reason: null }
    : await PreviewWorkerClient.getAvailability();
  const livePreviewAvailable = dockerAvailability.available || workerAvailability.available;
  const livePreviewReason = dockerAvailability.available
    ? null
    : workerAvailability.available
      ? 'Preview will be launched through the remote preview worker.'
      : workerAvailability.reason || dockerAvailability.reason;
  const latestSession = await PreviewSessionService.getLatest(params.id, user.id);
  let activePreview = latestSession;

  if (latestSession?.status === 'running' && latestSession.containerId) {
    try {
      if (latestSession.provider === 'preview-worker') {
        const workerStatus = await PreviewWorkerClient.getStatus(latestSession.containerId);
        if (!workerStatus.found || !workerStatus.running) {
          await PreviewSessionService.markStopped(latestSession.id, 'stopped');
          activePreview = {
            ...latestSession,
            status: 'stopped',
            stoppedAt: new Date().toISOString(),
            error: workerStatus.error || latestSession.error,
          };
        } else if (workerStatus.previewUrl && workerStatus.previewUrl !== latestSession.previewUrl) {
          await PreviewSessionService.syncRunning(latestSession.id, {
            previewUrl: workerStatus.previewUrl,
            expiresAt: workerStatus.expiresAt,
          });
          activePreview = {
            ...latestSession,
            previewUrl: workerStatus.previewUrl,
            expiresAt: workerStatus.expiresAt || latestSession.expiresAt,
          };
        }
      }
    } catch (error) {
      activePreview = {
        ...latestSession,
        error: error instanceof Error ? error.message : latestSession.error,
      };
    }
  }

  return NextResponse.json({
    livePreviewAvailable,
    livePreviewReason,
    previewProvider: dockerAvailability.available ? 'local-docker' : workerAvailability.available ? 'preview-worker' : 'none',
    previewProviderLabel: dockerAvailability.available ? 'Local Docker' : workerAvailability.available ? 'Remote Preview Worker' : 'Unavailable',
    fallbackPreviewAvailable: fileCount > 0,
    fallbackUrl: `/projects/${params.id}/preview`,
    activePreview,
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
  const workerAvailability = dockerAvailability.available
    ? { available: false, reason: null }
    : await PreviewWorkerClient.getAvailability();

  if (!dockerAvailability.available && !workerAvailability.available) {
    return NextResponse.json(
      {
        error: (workerAvailability.reason || dockerAvailability.reason)
          ? `Live preview requires Docker or a preview worker. ${workerAvailability.reason || dockerAvailability.reason}`
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

  const provider = dockerAvailability.available ? 'local-docker' : 'preview-worker';
  const sessionId = await PreviewSessionService.createLaunching(params.id, user.id, provider);

  let result;
  try {
    result = dockerAvailability.available
      ? await DockerSandbox.launchPreview(projectFiles, ttlSeconds)
      : await PreviewWorkerClient.launchPreview(projectFiles, ttlSeconds, params.id);
  } catch (error) {
    await PreviewSessionService.markFailed(
      sessionId,
      error instanceof Error ? error.message : 'Failed to reach the preview worker'
    );
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to reach the preview worker',
      },
      { status: 502 }
    );
  }

  if (!result.success) {
    await PreviewSessionService.markFailed(sessionId, result.error || 'Failed to launch preview');
    return NextResponse.json(
      { error: result.error || 'Failed to launch preview' },
      { status: 500 }
    );
  }

  await PreviewSessionService.markRunning(sessionId, {
    previewUrl: result.url,
    containerId: result.containerId,
    port: result.port,
    expiresAt: result.expiresAt,
  });

  return NextResponse.json({
    sessionId,
    url: result.url,
    containerId: result.containerId,
    port: result.port,
    expiresAt: result.expiresAt,
    ttlSeconds,
    provider,
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
      try {
        if (body.provider === 'preview-worker') {
          await PreviewWorkerClient.stopPreview(body.containerId);
        } else {
          DockerSandbox.stopPreview(body.containerId);
        }
        await PreviewSessionService.markStoppedByContainer(params.id, user.id, body.containerId, 'stopped');
      } catch {
        // Stopping a preview should be best-effort only.
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json({ stopped: true });
}
