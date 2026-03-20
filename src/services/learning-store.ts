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
   * Record a rejection pattern. If the pattern already exists, increment the count.
   */
  static async recordRejection(
    sourceAgent: string,
    targetAgent: string,
    pattern: string,
    runId?: string,
    stageId?: string
  ): Promise<void> {
    // Check if this pattern already exists
    const existing = await prisma.learningEntry.findFirst({
      where: {
        pattern: { contains: pattern.substring(0, 50) },
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
   * Get all active patterns for display.
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
   * Get stats for the learning store.
   */
  static async getStats(): Promise<{
    totalPatterns: number;
    activePatterns: number;
    resolvedPatterns: number;
    totalRejections: number;
    topOffenders: Array<{ agent: string; count: number }>;
  }> {
    const all = await prisma.learningEntry.findMany();
    const active = all.filter((e) => e.status === 'active');
    const resolved = all.filter((e) => e.status === 'resolved');
    const totalRejections = all.reduce((sum, e) => sum + e.rejectionCount, 0);

    // Count rejections by target agent
    const agentCounts = new Map<string, number>();
    for (const e of all) {
      agentCounts.set(e.targetAgent, (agentCounts.get(e.targetAgent) || 0) + e.rejectionCount);
    }
    const topOffenders = Array.from(agentCounts.entries())
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalPatterns: all.length,
      activePatterns: active.length,
      resolvedPatterns: resolved.length,
      totalRejections,
      topOffenders,
    };
  }
}
