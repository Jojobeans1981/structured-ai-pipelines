import { describe, expect, it } from 'vitest';
import {
  detectPreviewRuntimeBlocker,
  summarizePreviewRuntimeLogs,
} from '@/src/services/preview-runtime-guard';

describe('preview runtime guard', () => {
  it('detects vite parse failures from worker logs', () => {
    const blocker = detectPreviewRuntimeBlocker({
      error: null,
      logs: '[plugin:vite:import-analysis] Failed to parse source for import analysis because the content contains invalid JS syntax.',
    });

    expect(blocker).toContain('invalid JSX or import syntax');
  });

  it('detects malformed uri worker failures', () => {
    const blocker = detectPreviewRuntimeBlocker({
      error: 'URI malformed',
      logs: '',
    });

    expect(blocker).toContain('malformed URI');
  });

  it('keeps only the most recent worker log lines for ui display', () => {
    const logs = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n');

    expect(summarizePreviewRuntimeLogs(logs)).toHaveLength(12);
    expect(summarizePreviewRuntimeLogs(logs)[0]).toBe('line 9');
  });
});
