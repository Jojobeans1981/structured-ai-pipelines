import { prisma } from '@/src/lib/prisma';
import levenshtein from 'fast-levenshtein';

export interface LearningPattern {
  id: string;
  pattern: string;
  sourceAgent: string;
  targetAgent: string;
  rejectionCount: number;
  weight: number;
  resolution: string | null;
  status: string;
}

export interface LearningStats {
  totalPatterns: number;
  activePatterns: number;
  resolvedPatterns: number;
  totalRejections: number;
  topOffenders: Array<{ agent: string; count: number }>;
}

export class LearningStore {
  /**
   * Record a rejection pattern. Uses Levenshtein distance for fuzzy matching.
   * If an agent repeats a known error, we drop the weight as a penalty.
   */
  static async recordRejection(
    sourceAgent: string,
    targetAgent: string,
    pattern: string,
    runId?: string,
    stageId?: string,
  ): Promise<void> {
    const exact = await prisma.learningEntry.findFirst({
      where: { pattern, targetAgent, status: 'active' },
    });

    const activePatterns = exact
      ? [exact]
      : await prisma.learningEntry.findMany({
          where: { targetAgent, status: 'active' },
        });

    const existing = activePatterns.find((p) => {
      const dist = levenshtein.get(p.pattern, pattern);
      const maxLen = Math.max(p.pattern.length, pattern.length);
      return (maxLen - dist) / maxLen > 0.7;
    });

    if (existing) {
      const newWeight = Math.max(0, (existing.weight || 1.0) - 0.15);

      await prisma.learningEntry.update({
        where: { id: existing.id },
        data: {
          rejectionCount: (existing.rejectionCount || 0) + 1,
          weight: newWeight,
          lastSeen: new Date(),
          runId,
          stageId,
        },
      });
      console.log(`[LearningStore] Ignored warning: "${pattern.substring(0, 60)}" (weight dropped to ${newWeight.toFixed(2)})`);
    } else {
      await prisma.learningEntry.create({
        data: {
          pattern,
          sourceAgent,
          targetAgent,
          rejectionCount: 1,
          weight: 1.0,
          runId,
          stageId,
          status: 'active',
        },
      });
      console.log(`[LearningStore] New pattern learned: "${pattern.substring(0, 60)}"`);
    }
  }

  /**
   * Prune low-weight patterns that agents consistently ignore.
   */
  static async pruneStalePatterns(): Promise<number> {
    const result = await prisma.learningEntry.deleteMany({
      where: { weight: { lt: 0.3 }, status: 'active' },
    });

    if (result.count > 0) {
      console.log(`[LearningStore] Pruned ${result.count} ineffective patterns.`);
    }
    return result.count;
  }

  static async expireStalePatterns(): Promise<number> {
    return LearningStore.pruneStalePatterns();
  }

  static async resolve(id: string, resolution: string): Promise<void> {
    await prisma.learningEntry.update({
      where: { id },
      data: { status: 'resolved', resolution },
    });
  }

  static async getAllPatterns(): Promise<LearningPattern[]> {
    const entries = await prisma.learningEntry.findMany({
      orderBy: [
        { status: 'asc' },
        { rejectionCount: 'desc' },
      ],
    });

    return entries.map(toLearningPattern);
  }

  static async getActivePatterns(): Promise<LearningPattern[]> {
    const entries = await prisma.learningEntry.findMany({
      where: { status: 'active' },
      orderBy: { rejectionCount: 'desc' },
    });

    return entries.map(toLearningPattern);
  }

  static async getStats(): Promise<LearningStats> {
    const [totalPatterns, activePatterns, resolvedPatterns, rejectionAggregate, offenders] = await Promise.all([
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
      totalRejections: rejectionAggregate._sum.rejectionCount ?? 0,
      topOffenders: offenders.map((entry) => ({
        agent: entry.targetAgent,
        count: entry._sum.rejectionCount ?? 0,
      })),
    };
  }

  static async getWarningsFor(targetAgent: string): Promise<string[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const entries = await prisma.learningEntry.findMany({
      where: {
        targetAgent,
        status: 'active',
        rejectionCount: { gte: 1 },
        lastSeen: { gte: sevenDaysAgo },
      },
      orderBy: { rejectionCount: 'desc' },
      take: 10,
    });

    return entries.map((e) =>
      `Known issue automatically rejected before (seen ${e.rejectionCount}x): ${e.pattern}${e.resolution ? ` - Resolution: ${e.resolution}` : ''}`,
    );
  }

  static async getWarningBlock(targetAgent: string): Promise<string> {
    const warnings = await LearningStore.getWarningsFor(targetAgent);
    if (warnings.length === 0) return '';
    return '\n\n## FORGE QUALITY WARNINGS\n' + warnings.map((w) => `- ${w}`).join('\n') + '\n';
  }

  static async resolveForAgent(targetAgent: string, resolution: string): Promise<number> {
    const result = await prisma.learningEntry.updateMany({
      where: { status: 'active', targetAgent },
      data: { status: 'resolved', resolution },
    });
    return result.count;
  }
}

function toLearningPattern(entry: {
  id: string;
  pattern: string;
  sourceAgent: string;
  targetAgent: string;
  rejectionCount: number;
  weight: number;
  resolution: string | null;
  status: string;
}): LearningPattern {
  return {
    id: entry.id,
    pattern: entry.pattern,
    sourceAgent: entry.sourceAgent,
    targetAgent: entry.targetAgent,
    rejectionCount: entry.rejectionCount,
    weight: entry.weight,
    resolution: entry.resolution,
    status: entry.status,
  };
}
