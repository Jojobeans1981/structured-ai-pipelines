/**
 * Mock Prisma client for unit tests.
 *
 * Each model exposes the standard Prisma methods as vi.fn() stubs.
 * Tests configure return values per-test via mockResolvedValue / mockReturnValue.
 */
import { vi } from 'vitest';

function mockModel() {
  return {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
    groupBy: vi.fn().mockResolvedValue([]),
  };
}

export const prisma = {
  learningEntry: mockModel(),
  pipelineMetric: mockModel(),
  pipelineRun: mockModel(),
  pipelineStage: mockModel(),
  confidenceScore: mockModel(),
  traceEvent: mockModel(),
  project: mockModel(),
  forgeRun: mockModel(),
};

// This mock gets wired in via vi.mock in each test file
export default prisma;
