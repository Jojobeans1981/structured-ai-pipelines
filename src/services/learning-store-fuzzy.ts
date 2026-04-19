import levenshtein from 'fast-levenshtein';

// Inside LearningStore class:
static async recordRejection(sourceAgent: string, targetAgent: string, pattern: string) {
  const activePatterns = await prisma.learningEntry.findMany({
    where: { targetAgent, status: 'active' }
  });

  const SIMILARITY_THRESHOLD = 0.7;
  const existing = activePatterns.find(p => {
    const distance = levenshtein.get(p.pattern, pattern);
    const longer = Math.max(p.pattern.length, pattern.length);
    return (longer - distance) / longer > SIMILARITY_THRESHOLD;
  });

  if (existing) {
    await prisma.learningEntry.update({
      where: { id: existing.id },
      data: { rejectionCount: existing.rejectionCount + 1, lastSeen: new Date() }
    });
  } else {
    await prisma.learningEntry.create({
      data: { pattern, sourceAgent, targetAgent, rejectionCount: 1 }
    });
  }
}
