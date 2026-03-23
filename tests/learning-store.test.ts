/**
 * Unit tests for LearningStore service.
 *
 * Validates: pattern recording, deduplication, stats aggregation,
 * warning injection, pattern resolution, and the getAllPatterns query.
 * Prisma is fully mocked — no database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma BEFORE importing the service
vi.mock('@/src/lib/prisma', () => import('./__mocks__/prisma'));

import { LearningStore } from '@/src/services/learning-store';
import { prisma } from './__mocks__/prisma';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// recordRejection
// ---------------------------------------------------------------------------
describe('LearningStore.recordRejection', () => {
  it('creates a new entry when no duplicate exists', async () => {
    prisma.learningEntry.findFirst.mockResolvedValue(null);
    prisma.learningEntry.create.mockResolvedValue({});

    await LearningStore.recordRejection('sentinel', 'phase-builder', 'Missing acceptance criteria');

    expect(prisma.learningEntry.findFirst).toHaveBeenCalledWith({
      where: {
        pattern: 'Missing acceptance criteria',
        targetAgent: 'phase-builder',
        status: 'active',
      },
    });
    expect(prisma.learningEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pattern: 'Missing acceptance criteria',
        sourceAgent: 'sentinel',
        targetAgent: 'phase-builder',
        rejectionCount: 1,
      }),
    });
  });

  it('increments count when a duplicate pattern exists', async () => {
    prisma.learningEntry.findFirst.mockResolvedValue({
      id: 'existing-1',
      pattern: 'Missing acceptance criteria',
      rejectionCount: 3,
    });
    prisma.learningEntry.update.mockResolvedValue({});

    await LearningStore.recordRejection('sentinel', 'phase-builder', 'Missing acceptance criteria');

    expect(prisma.learningEntry.create).not.toHaveBeenCalled();
    expect(prisma.learningEntry.update).toHaveBeenCalledWith({
      where: { id: 'existing-1' },
      data: expect.objectContaining({
        rejectionCount: 4,
      }),
    });
  });

  it('matches on full pattern string, not substring', async () => {
    prisma.learningEntry.findFirst.mockResolvedValue(null);
    prisma.learningEntry.create.mockResolvedValue({});

    const longPattern = 'A'.repeat(200);
    await LearningStore.recordRejection('sentinel', 'prompt-builder', longPattern);

    // The findFirst where clause must use the FULL pattern, not substring(0, 50)
    const findCall = prisma.learningEntry.findFirst.mock.calls[0][0];
    expect(findCall.where.pattern).toBe(longPattern);
    // Ensure no { contains: ... } is used
    expect(typeof findCall.where.pattern).toBe('string');
  });

  it('passes runId and stageId when provided', async () => {
    prisma.learningEntry.findFirst.mockResolvedValue(null);
    prisma.learningEntry.create.mockResolvedValue({});

    await LearningStore.recordRejection('sentinel', 'phase-builder', 'test', 'run-1', 'stage-1');

    expect(prisma.learningEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: 'run-1',
        stageId: 'stage-1',
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// getWarningsFor
// ---------------------------------------------------------------------------
describe('LearningStore.getWarningsFor', () => {
  it('returns formatted warnings for a target agent', async () => {
    prisma.learningEntry.findMany.mockResolvedValue([
      { pattern: 'Missing test cases', rejectionCount: 5, resolution: null },
      { pattern: 'Incomplete error handling', rejectionCount: 2, resolution: 'Added try/catch' },
    ]);

    const warnings = await LearningStore.getWarningsFor('phase-executor');

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('seen 5x');
    expect(warnings[0]).toContain('Missing test cases');
    expect(warnings[1]).toContain('Resolution: Added try/catch');
  });

  it('returns empty array when no active patterns exist', async () => {
    prisma.learningEntry.findMany.mockResolvedValue([]);

    const warnings = await LearningStore.getWarningsFor('nonexistent-agent');
    expect(warnings).toEqual([]);
  });

  it('queries only active patterns with rejectionCount >= 1', async () => {
    prisma.learningEntry.findMany.mockResolvedValue([]);

    await LearningStore.getWarningsFor('phase-builder');

    expect(prisma.learningEntry.findMany).toHaveBeenCalledWith({
      where: {
        targetAgent: 'phase-builder',
        status: 'active',
        rejectionCount: { gte: 1 },
      },
      orderBy: { rejectionCount: 'desc' },
      take: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// getWarningBlock
// ---------------------------------------------------------------------------
describe('LearningStore.getWarningBlock', () => {
  it('returns empty string when no warnings exist', async () => {
    prisma.learningEntry.findMany.mockResolvedValue([]);

    const block = await LearningStore.getWarningBlock('clean-agent');
    expect(block).toBe('');
  });

  it('returns formatted markdown block with warnings', async () => {
    prisma.learningEntry.findMany.mockResolvedValue([
      { pattern: 'Off-by-one in loop', rejectionCount: 3, resolution: null },
    ]);

    const block = await LearningStore.getWarningBlock('phase-executor');

    expect(block).toContain('FOREMAN WARNINGS');
    expect(block).toContain('Off-by-one in loop');
    expect(block).toContain('Address these proactively');
  });
});

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------
describe('LearningStore.resolve', () => {
  it('marks a pattern as resolved with a resolution string', async () => {
    prisma.learningEntry.update.mockResolvedValue({});

    await LearningStore.resolve('pattern-123', 'Added validation step');

    expect(prisma.learningEntry.update).toHaveBeenCalledWith({
      where: { id: 'pattern-123' },
      data: { status: 'resolved', resolution: 'Added validation step' },
    });
  });
});

// ---------------------------------------------------------------------------
// getAllPatterns
// ---------------------------------------------------------------------------
describe('LearningStore.getAllPatterns', () => {
  it('returns both active and resolved patterns', async () => {
    prisma.learningEntry.findMany.mockResolvedValue([
      { id: '1', pattern: 'Active bug', sourceAgent: 's1', targetAgent: 't1', rejectionCount: 5, resolution: null, status: 'active' },
      { id: '2', pattern: 'Fixed bug', sourceAgent: 's2', targetAgent: 't2', rejectionCount: 2, resolution: 'Patched', status: 'resolved' },
    ]);

    const patterns = await LearningStore.getAllPatterns();

    expect(patterns).toHaveLength(2);
    expect(patterns[0].status).toBe('active');
    expect(patterns[1].status).toBe('resolved');
    expect(patterns[1].resolution).toBe('Patched');
  });

  it('orders by status (active first) then by rejectionCount desc', async () => {
    prisma.learningEntry.findMany.mockResolvedValue([]);

    await LearningStore.getAllPatterns();

    expect(prisma.learningEntry.findMany).toHaveBeenCalledWith({
      orderBy: [
        { status: 'asc' },
        { rejectionCount: 'desc' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// getActivePatterns
// ---------------------------------------------------------------------------
describe('LearningStore.getActivePatterns', () => {
  it('only returns active patterns', async () => {
    prisma.learningEntry.findMany.mockResolvedValue([
      { id: '1', pattern: 'Bug', sourceAgent: 's', targetAgent: 't', rejectionCount: 1, resolution: null, status: 'active' },
    ]);

    const patterns = await LearningStore.getActivePatterns();

    expect(patterns).toHaveLength(1);
    expect(prisma.learningEntry.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      orderBy: { rejectionCount: 'desc' },
    });
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------
describe('LearningStore.getStats', () => {
  it('uses DB aggregation, not findMany + JS reduce', async () => {
    prisma.learningEntry.count
      .mockResolvedValueOnce(10)   // totalPatterns
      .mockResolvedValueOnce(7)    // activePatterns
      .mockResolvedValueOnce(3);   // resolvedPatterns
    prisma.learningEntry.aggregate.mockResolvedValue({
      _sum: { rejectionCount: 42 },
    });
    prisma.learningEntry.groupBy.mockResolvedValue([
      { targetAgent: 'phase-builder', _sum: { rejectionCount: 20 } },
      { targetAgent: 'phase-executor', _sum: { rejectionCount: 15 } },
    ]);

    const stats = await LearningStore.getStats();

    expect(stats.totalPatterns).toBe(10);
    expect(stats.activePatterns).toBe(7);
    expect(stats.resolvedPatterns).toBe(3);
    expect(stats.totalRejections).toBe(42);
    expect(stats.topOffenders).toHaveLength(2);
    expect(stats.topOffenders[0]).toEqual({ agent: 'phase-builder', count: 20 });

    // Verify it used count/aggregate/groupBy — NOT findMany
    expect(prisma.learningEntry.count).toHaveBeenCalledTimes(3);
    expect(prisma.learningEntry.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.learningEntry.groupBy).toHaveBeenCalledTimes(1);
  });

  it('returns zeros when table is empty', async () => {
    prisma.learningEntry.count.mockResolvedValue(0);
    prisma.learningEntry.aggregate.mockResolvedValue({ _sum: { rejectionCount: null } });
    prisma.learningEntry.groupBy.mockResolvedValue([]);

    const stats = await LearningStore.getStats();

    expect(stats.totalPatterns).toBe(0);
    expect(stats.totalRejections).toBe(0);
    expect(stats.topOffenders).toEqual([]);
  });
});
