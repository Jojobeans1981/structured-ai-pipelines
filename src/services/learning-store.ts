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

export class LearningStore {
  /**
   * Record a rejection pattern. Uses Levenshtein distance for fuzzy matching.
   * If an agent repeats a known error, we DROP the weight (penalty).
   */
  static async recordRejection(
    sourceAgent: string,
    targetAgent: string,
    pattern: string,
    runId?: string,
    stageId?: string
  ): Promise<void> {
    const activePatterns = await prisma.learningEntry.findMany({ 
      where: { targetAgent, status: "active" } 
    });
    
    const existing = activePatterns.find(p => {
      const dist = levenshtein.get(p.pattern, pattern);
      const maxLen = Math.max(p.pattern.length, pattern.length);
      return (maxLen - dist) / maxLen > 0.7;
    });

    if (existing) {
      // PENALTY: The agent ignored the warning. Drop the weight by 15%.
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
      console.log(`[LearningStore] Ignored Warning: "${pattern.substring(0, 60)}" (weight dropped to ${newWeight.toFixed(2)})`);
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
          status: "active"
        },
      });
      console.log(`[LearningStore] New pattern learned: "${pattern.substring(0, 60)}"`);
    }
  }

  /**
   * Prune low-weight patterns (weight < 0.3) that agents consistently ignore.
   */
  static async pruneStalePatterns(): Promise<number> {
    const result = await prisma.learningEntry.deleteMany({
      where: { weight: { lt: 0.3 }, status: 'active' }
    });
    
    if (result.count > 0) {
      console.log(`[LearningStore] Ì∑π Pruned ${result.count} ineffective patterns.`);
    }
    return result.count;
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
      `‚ö†Ô∏è KNOWN ISSUE (seen ${e.rejectionCount}x): ${e.pattern}${e.resolution ? ` ‚Äî Resolution: ${e.resolution}` : ''}`
    );
  }

  static async getWarningBlock(targetAgent: string): Promise<string> {
    const warnings = await LearningStore.getWarningsFor(targetAgent);
    if (warnings.length === 0) return '';
    return '\n\n## ‚ö†Ô∏è FORGE QUALITY WARNINGS\n' + warnings.map(w => `- ${w}`).join('\n') + '\n';
  }

  static async resolveForAgent(targetAgent: string, resolution: string): Promise<number> {
    const result = await prisma.learningEntry.updateMany({
      where: { status: 'active', targetAgent },
      data: { status: 'resolved', resolution },
    });
    return result.count;
  }
}
