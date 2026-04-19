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
        const activePatterns = await prisma.learningEntry.findMany({ where: { targetAgent, status: "active" } });
    const levenshtein = require("fast-levenshtein");
    const existing = activePatterns.find(p => {
      const dist = levenshtein.get(p.pattern, pattern);
      const maxLen = Math.max(p.pattern.length, pattern.length);
      return (maxLen - dist) / maxLen > 0.7;
    });

    if (existing) {
      await prisma.learningEntry.update({
        where: { status: "active", targetAgent,  id: existing.id },
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
   * Returns top patterns by rejection count, limited to recent (last 7 days).
   */
  static async getWarningsFor(targetAgent: string): Promise<string[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const entries = await prisma.learningEntry.findMany({
      where: { status: "active", targetAgent, 
        targetAgent,
        status: 'active',
        rejectionCount: { gte: 1 },
        lastSeen: { gte: sevenDaysAgo },
      },
      orderBy: { rejectionCount: 'desc' },
      take: 10,
    });

    return entries.map((e) =>
      `⚠️ KNOWN ISSUE (seen ${e.rejectionCount}x): ${e.pattern}${e.resolution ? ` — Resolution: ${e.resolution}` : ''}`
    );
  }

  /**
   * Build an actionable warning block to inject into an agent's context.
   * Groups patterns by category and provides specific instructions.
   */
  static async getWarningBlock(targetAgent: string): Promise<string> {
    const warnings = await LearningStore.getWarningsFor(targetAgent);
    if (warnings.length === 0) return '';

    // Categorize patterns for actionable grouping
    const categories: Record<string, string[]> = {
      imports: [],
      files: [],
      stubs: [],
      config: [],
      deps: [],
      other: [],
    };

    for (const w of warnings) {
      const lower = w.toLowerCase();
      if (lower.includes('import') || lower.includes('require') || lower.includes('reference')) {
        categories.imports.push(w);
      } else if (lower.includes('file') || lower.includes('directory') || lower.includes('missing')) {
        categories.files.push(w);
      } else if (lower.includes('todo') || lower.includes('fixme') || lower.includes('stub') || lower.includes('empty')) {
        categories.stubs.push(w);
      } else if (lower.includes('config') || lower.includes('tsconfig') || lower.includes('package.json') || lower.includes('env')) {
        categories.config.push(w);
      } else if (lower.includes('depend') || lower.includes('install') || lower.includes('build')) {
        categories.deps.push(w);
      } else {
        categories.other.push(w);
      }
    }

    let block = '\n\n## ⚠️ FORGE QUALITY WARNINGS — YOU MUST ADDRESS THESE\n\n' +
      'Previous runs had the following issues. The forge will REJECT your output if you repeat them.\n\n';

    if (categories.imports.length > 0) {
      block += '### ❌ BROKEN IMPORTS (seen ' + categories.imports.length + 'x)\n' +
        'Every `import` and `require` MUST reference a file you actually create. Before outputting, verify every import path exists.\n' +
        categories.imports.map((w) => `- ${w}`).join('\n') + '\n\n';
    }

    if (categories.files.length > 0) {
      block += '### ❌ MISSING FILES/DIRECTORIES (seen ' + categories.files.length + 'x)\n' +
        'Create ALL files listed in the spec. Do not skip any directory. Check the PRD file structure.\n' +
        categories.files.map((w) => `- ${w}`).join('\n') + '\n\n';
    }

    if (categories.stubs.length > 0) {
      block += '### ❌ STUBS/EMPTY CODE (seen ' + categories.stubs.length + 'x)\n' +
        'Every function must have a REAL implementation. No TODO, FIXME, "implement later", or empty bodies.\n' +
        categories.stubs.map((w) => `- ${w}`).join('\n') + '\n\n';
    }

    if (categories.config.length > 0) {
      block += '### ❌ CONFIG ISSUES (seen ' + categories.config.length + 'x)\n' +
        'package.json must have all deps + build/dev scripts. Include tsconfig.json, .env.example, .gitignore.\n' +
        categories.config.map((w) => `- ${w}`).join('\n') + '\n\n';
    }

    if (categories.deps.length > 0) {
      block += '### ❌ DEPENDENCY/BUILD ISSUES (seen ' + categories.deps.length + 'x)\n' +
        'All imported packages must be in package.json dependencies. Build scripts must work.\n' +
        categories.deps.map((w) => `- ${w}`).join('\n') + '\n\n';
    }

    if (categories.other.length > 0) {
      block += '### ⚠️ OTHER ISSUES\n' +
        categories.other.map((w) => `- ${w}`).join('\n') + '\n\n';
    }

    block += '**If your output has ANY of these issues, it will be automatically rejected. Fix them before outputting.**\n';

    return block;
  }

  /**
   * Mark a pattern as resolved.
   */
  static async resolve(patternId: string, resolution: string): Promise<void> {
    await prisma.learningEntry.update({
      where: { status: "active", targetAgent,  id: patternId },
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
   * Auto-expire stale patterns. Resolves active patterns that haven't
   * been seen in 7+ days — they're no longer relevant.
   */
  static async expireStalePatterns(): Promise<number> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await prisma.learningEntry.updateMany({
      where: { status: "active", targetAgent, 
        status: 'active',
        lastSeen: { lt: sevenDaysAgo },
      },
      data: {
        status: 'resolved',
        resolution: 'Auto-expired — not seen in 7+ days',
      },
    });

    if (result.count > 0) {
      console.log(`[LearningStore] Auto-expired ${result.count} stale patterns`);
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
      where: { status: "active", targetAgent,  status: 'active' },
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
        prisma.learningEntry.count({ where: { status: "active", targetAgent,  status: 'active' } }),
        prisma.learningEntry.count({ where: { status: "active", targetAgent,  status: 'resolved' } }),
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

  /**
   * Prune low-weight patterns that agents ignore.
   * Decrements weight if pattern is seen but agent still fails.
   */
  static async pruneStalePatterns(): Promise<void> {
    await prisma.learningEntry.deleteMany({
      where: { weight: { lt: 0.3 }, status: 'active' }
    });
    console.log('[LearningStore] Pruned ineffective patterns.');
  
  /**
   * Prune low-weight patterns that agents ignore.
   */
  static async pruneStalePatterns(): Promise<void> {
    await prisma.learningEntry.deleteMany({
      where: { weight: { lt: 0.3 }, status: "active" }
    });
    console.log("[LearningStore] Pruned ineffective patterns.");
  }

  /**
   * Prune patterns with low weight that agents continue to ignore.
   */
  static async pruneStalePatterns(): Promise<void> {
    await prisma.learningEntry.deleteMany({
      where: { weight: { lt: 0.3 }, status: "active" }
    });
    console.log("[LearningStore] Pruned ineffective patterns.");
  }

  /**
   * Prune patterns with low weight that agents continue to ignore.
   */
  static async pruneStalePatterns(): Promise<void> {
    await prisma.learningEntry.deleteMany({
      where: { weight: { lt: 0.3 }, status: "active" }
    });
    console.log("[LearningStore] Pruned ineffective patterns.");
  }
}