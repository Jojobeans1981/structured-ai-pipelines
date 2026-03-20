import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { MetricsService } from '@/src/services/metrics-service';
import { prisma } from '@/src/lib/prisma';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  // First, backfill metrics for any completed runs that don't have metrics yet
  try {
    const runsWithoutMetrics = await prisma.pipelineRun.findMany({
      where: {
        project: { userId: user.id },
        status: { in: ['completed', 'failed', 'cancelled'] },
        metrics: { none: {} },
      },
      select: { id: true },
      take: 50,
    });

    for (const run of runsWithoutMetrics) {
      try {
        await MetricsService.collectMetrics(run.id);
      } catch {
        // Skip runs that fail to collect — don't block the page
      }
    }
  } catch {
    // Non-fatal — just show what we have
  }

  const summary = await MetricsService.getMetricsSummary(user.id);
  return NextResponse.json({ data: summary });
}
