import { prisma } from '@/src/lib/prisma';

export interface LearningPattern {
  id: string;
  pattern: string;
  sourceAgent: string;
  targetAgent: string;
  rejectionCount: number;
  resolution: string | null;
  status: string;
}

export class LearningStore {
  /**
   * Record a rejection pattern. If an identical active pattern exists for the
   * same targetAgent, increment its count. Matching uses the full pattern
   * string for accuracy — not a substring prefix.
   */
  static async recordRejection(
    sourceAgent: string,
    targetAgent: string,
    pattern: string,
    runId?: string,
    stageId?: string
  ): Promise<void> {
    const existing = await prisma.learningEntry.findFirst({
      where: {
        pattern,
        targetAgent,
        status: 'active',
      },
    });

    if (existing) {
      await prisma.learningEntry.update({
        where: { id: existing.id },
        data: {
          rejectionCount: existing.rejectionCount + 1,
          lastSeen: new Date(),
          runId,
          stageId,
        },
      });
      console.log(`[LearningStore] Updated pattern: "${pattern.substring(0, 60)}" (count: ${existing.rejectionCount + 1})`);
    } else {
      await prisma.learningEntry.create({
        data: {
          pattern,
          sourceAgent,
          targetAgent,
          rejectionCount: 1,
          runId,
          stageId,
        },
      });
      console.log(`[LearningStore] New pattern: "${pattern.substring(0, 60)}" (${sourceAgent} → ${targetAgent})`);
    }
  }

  /**
   * Get active warnings for a target agent.
   * Foreman calls this before dispatching to inject warnings.
   */
  static async getWarningsFor(targetAgent: string): Promise<string[]> {
    const entries = await prisma.learningEntry.findMany({
      where: {
        targetAgent,
        status: 'active',
        rejectionCount: { gte: 1 },
      },
      orderBy: { rejectionCount: 'desc' },
      take: 5,
    });

    return entries.map((e) =>
      `⚠️ KNOWN ISSUE (seen ${e.rejectionCount}x): ${e.pattern}${e.resolution ? ` — Resolution: ${e.resolution}` : ''}`
    );
  }

  /**
   * Build a warning block to inject into an agent's context.
   */
  static async getWarningBlock(targetAgent: string): Promise<string> {
    const warnings = await LearningStore.getWarningsFor(targetAgent);
    if (warnings.length === 0) return '';

    return '\n\n## ⚠️ FOREMAN WARNINGS (from prior failures)\n\n' +
      'The following issues have been detected in previous runs. Avoid repeating them:\n\n' +
      warnings.map((w, i) => `${i + 1}. ${w}`).join('\n') +
      '\n\nAddress these proactively in your output.\n';
  }

  /**
   * Mark a pattern as resolved.
   */
  static async resolve(patternId: string, resolution: string): Promise<void> {
    await prisma.learningEntry.update({
      where: { id: patternId },
      data: { status: 'resolved', resolution },
    });
  }

  /**
   * Resolve all active patterns for a given target agent (and optionally source agent).
   * Called when a stage passes inspector/sentinel verification, indicating the
   * issues described by those patterns have been addressed.
   */
  static async resolveForAgent(
    targetAgent: string,
    resolution: string,
    sourceAgent?: string
  ): Promise<number> {
    const where: Record<string, unknown> = {
      status: 'active',
      targetAgent,
    };
    if (sourceAgent) {
      where.sourceAgent = sourceAgent;
    }

    const result = await prisma.learningEntry.updateMany({
      where,
      data: { status: 'resolved', resolution },
    });

    if (result.count > 0) {
      console.log(`[LearningStore] Resolved ${result.count} patterns for ${targetAgent} — ${resolution}`);
    }
    return result.count;
  }

  /**
   * Get all patterns (active + resolved) for display, ordered by status
   * then rejection count.
   */
  static async getAllPatterns(): Promise<LearningPattern[]> {
    const entries = await prisma.learningEntry.findMany({
      orderBy: [
        { status: 'asc' }, // 'active' sorts before 'resolved'
        { rejectionCount: 'desc' },
      ],
    });

    return entries.map((e) => ({
      id: e.id,
      pattern: e.pattern,
      sourceAgent: e.sourceAgent,
      targetAgent: e.targetAgent,
      rejectionCount: e.rejectionCount,
      resolution: e.resolution,
      status: e.status,
    }));
  }

  /**
   * Get active patterns only (kept for backward compat with warning injection).
   */
  static async getActivePatterns(): Promise<LearningPattern[]> {
    const entries = await prisma.learningEntry.findMany({
      where: { status: 'active' },
      orderBy: { rejectionCount: 'desc' },
    });

    return entries.map((e) => ({
      id: e.id,
      pattern: e.pattern,
      sourceAgent: e.sourceAgent,
      targetAgent: e.targetAgent,
      rejectionCount: e.rejectionCount,
      resolution: e.resolution,
      status: e.status,
    }));
  }

  /**
   * Get stats using DB aggregation instead of loading all rows.
   */
  static async getStats(): Promise<{
    totalPatterns: number;
    activePatterns: number;
    resolvedPatterns: number;
    totalRejections: number;
    topOffenders: Array<{ agent: string; count: number }>;
  }> {
    const [totalPatterns, activePatterns, resolvedPatterns, rejectionAgg, offenderAgg] =
      await Promise.all([
        prisma.learningEntry.count(),
        prisma.learningEntry.count({ where: { status: 'active' } }),
        prisma.learningEntry.count({ where: { status: 'resolved' } }),
        prisma.learningEntry.aggregate({ _sum: { rejectionCount: true } }),
        prisma.learningEntry.groupBy({
          by: ['targetAgent'],
          _sum: { rejectionCount: true },
          orderBy: { _sum: { rejectionCount: 'desc' } },
          take: 5,
        }),
      ]);

    return {
      totalPatterns,
      activePatterns,
      resolvedPatterns,
      totalRejections: rejectionAgg._sum.rejectionCount || 0,
      topOffenders: offenderAgg.map((row) => ({
        agent: row.targetAgent,
        count: row._sum.rejectionCount || 0,
      })),
    };
  }
}
