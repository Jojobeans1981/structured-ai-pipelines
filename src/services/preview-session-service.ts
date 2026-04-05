import { prisma } from '@/src/lib/prisma';

type PreviewProvider = 'local-docker' | 'preview-worker';
type PreviewStatus = 'launching' | 'running' | 'stopped' | 'failed' | 'expired';

export interface PreviewSessionSnapshot {
  id: string;
  provider: string;
  status: string;
  previewUrl: string | null;
  containerId: string | null;
  port: number | null;
  expiresAt: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  error: string | null;
}

function toSnapshot(session: {
  id: string;
  provider: string;
  status: string;
  previewUrl: string | null;
  containerId: string | null;
  port: number | null;
  expiresAt: Date | null;
  startedAt: Date | null;
  stoppedAt: Date | null;
  error: string | null;
}): PreviewSessionSnapshot {
  return {
    id: session.id,
    provider: session.provider,
    status: session.status,
    previewUrl: session.previewUrl,
    containerId: session.containerId,
    port: session.port,
    expiresAt: session.expiresAt?.toISOString() || null,
    startedAt: session.startedAt?.toISOString() || null,
    stoppedAt: session.stoppedAt?.toISOString() || null,
    error: session.error,
  };
}

export class PreviewSessionService {
  static async getLatest(projectId: string, userId: string): Promise<PreviewSessionSnapshot | null> {
    const session = await prisma.previewSession.findFirst({
      where: { projectId, userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) return null;

    if (session.status === 'running' && session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      const expired = await prisma.previewSession.update({
        where: { id: session.id },
        data: {
          status: 'expired',
          stoppedAt: session.stoppedAt || new Date(),
          error: session.error || 'Preview session reached its expiration time.',
        },
      });
      return toSnapshot(expired);
    }

    return toSnapshot(session);
  }

  static async createLaunching(projectId: string, userId: string, provider: PreviewProvider): Promise<string> {
    await prisma.previewSession.updateMany({
      where: { projectId, userId, status: { in: ['launching', 'running'] } },
      data: {
        status: 'stopped',
        stoppedAt: new Date(),
        error: 'Superseded by a newer preview launch request.',
      },
    });

    const session = await prisma.previewSession.create({
      data: {
        projectId,
        userId,
        provider,
        status: 'launching',
      },
      select: { id: true },
    });

    return session.id;
  }

  static async markRunning(
    sessionId: string,
    data: {
      previewUrl: string | null;
      containerId: string | null;
      port: number | null;
      expiresAt: string | null;
    }
  ): Promise<void> {
    await prisma.previewSession.update({
      where: { id: sessionId },
      data: {
        status: 'running',
        previewUrl: data.previewUrl,
        containerId: data.containerId,
        port: data.port,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        startedAt: new Date(),
        stoppedAt: null,
        error: null,
      },
    });
  }

  static async syncRunning(
    sessionId: string,
    data: {
      previewUrl?: string | null;
      expiresAt?: string | null;
    }
  ): Promise<void> {
    await prisma.previewSession.update({
      where: { id: sessionId },
      data: {
        previewUrl: data.previewUrl,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });
  }

  static async markFailed(sessionId: string, error: string): Promise<void> {
    await prisma.previewSession.update({
      where: { id: sessionId },
      data: {
        status: 'failed',
        error,
        stoppedAt: new Date(),
      },
    });
  }

  static async markStopped(sessionId: string, status: PreviewStatus = 'stopped'): Promise<void> {
    await prisma.previewSession.update({
      where: { id: sessionId },
      data: {
        status,
        stoppedAt: new Date(),
      },
    });
  }

  static async markStoppedByContainer(projectId: string, userId: string, containerId: string, status: PreviewStatus = 'stopped'): Promise<void> {
    await prisma.previewSession.updateMany({
      where: { projectId, userId, containerId, status: { in: ['launching', 'running'] } },
      data: {
        status,
        stoppedAt: new Date(),
      },
    });
  }
}
