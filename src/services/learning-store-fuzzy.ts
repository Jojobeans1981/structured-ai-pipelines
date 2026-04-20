import { prisma } from '@/src/lib/prisma';
import levenshtein from 'fast-levenshtein';

export class LearningStoreFuzzy {
  static async recordRejection(sourceAgent: string, targetAgent: string, pattern: string): Promise<void> {
    const activePatterns = await prisma.learningEntry.findMany({ 
      where: { targetAgent, status: "active" } 
    });
    
    const existing = activePatterns.find(p => {
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
        },
      });
    } else {
      await prisma.learningEntry.create({
        data: {
          pattern,
          sourceAgent,
          targetAgent,
          rejectionCount: 1,
          weight: 1.0,
          status: "active"
        },
      });
    }
  }
}
