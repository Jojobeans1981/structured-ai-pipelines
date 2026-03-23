/**
 * Structural tests for the metrics page.
 *
 * These tests validate that the page.tsx source code is structurally correct
 * without requiring a full React render environment (no jsdom/happy-dom).
 * They read the source and verify the patterns that caused the bugs are fixed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PAGE_SOURCE = readFileSync(
  resolve(__dirname, '../app/metrics/page.tsx'),
  'utf-8'
);

const LEARNING_STORE_SOURCE = readFileSync(
  resolve(__dirname, '../src/services/learning-store.ts'),
  'utf-8'
);

const LEARNING_API_SOURCE = readFileSync(
  resolve(__dirname, '../app/api/learning/route.ts'),
  'utf-8'
);

// ---------------------------------------------------------------------------
// Bug regression: useState must not be used for side effects
// ---------------------------------------------------------------------------
describe('No useState-as-useEffect anti-pattern', () => {
  it('does not use useState to fire fetch calls', () => {
    // The old bug: useState(() => { fetch(...) })
    // Match useState with a callback that contains fetch
    const useStateFetchPattern = /useState\s*\(\s*\(\)\s*=>\s*\{[^}]*fetch\s*\(/;
    expect(PAGE_SOURCE).not.toMatch(useStateFetchPattern);
  });

  it('imports useEffect from React', () => {
    expect(PAGE_SOURCE).toMatch(/import\s+\{[^}]*useEffect[^}]*\}\s+from\s+['"]react['"]/);
  });

  it('uses useEffect for data fetching in PromptHealthPanel', () => {
    // Extract the PromptHealthPanel function body
    const panelStart = PAGE_SOURCE.indexOf('function PromptHealthPanel');
    const learningStart = PAGE_SOURCE.indexOf('function LearningStorePanel');
    const healthPanel = PAGE_SOURCE.substring(panelStart, learningStart);

    expect(healthPanel).toContain('useEffect');
    expect(healthPanel).toContain("fetch('/api/metrics/prompt-health')");
  });

  it('uses useEffect for data fetching in LearningStorePanel', () => {
    const panelStart = PAGE_SOURCE.indexOf('function LearningStorePanel');
    const learningPanel = PAGE_SOURCE.substring(panelStart);

    expect(learningPanel).toContain('useEffect');
    expect(learningPanel).toContain("fetch('/api/learning')");
  });
});

// ---------------------------------------------------------------------------
// Bug regression: Learning Store must show resolved patterns
// ---------------------------------------------------------------------------
describe('Learning Store shows resolved patterns', () => {
  it('API uses getAllPatterns not just getActivePatterns', () => {
    expect(LEARNING_API_SOURCE).toContain('getAllPatterns');
  });

  it('page has a toggle for resolved patterns', () => {
    expect(PAGE_SOURCE).toContain('showResolved');
    expect(PAGE_SOURCE).toContain('Show resolved');
  });

  it('displays resolution text for resolved patterns', () => {
    expect(PAGE_SOURCE).toContain('p.resolution');
  });
});

// ---------------------------------------------------------------------------
// Bug regression: Learning Store must be visible (not buried at bottom)
// ---------------------------------------------------------------------------
describe('Learning Store positioning', () => {
  it('Learning Store panel renders before the Tabs component', () => {
    const learningPanelPos = PAGE_SOURCE.indexOf('<LearningStorePanel');
    const tabsPos = PAGE_SOURCE.indexOf('<Tabs');

    expect(learningPanelPos).toBeGreaterThan(-1);
    expect(tabsPos).toBeGreaterThan(-1);
    expect(learningPanelPos).toBeLessThan(tabsPos);
  });

  it('Learning Store and Prompt Health are in a grid layout', () => {
    // They should be siblings in a grid container
    const gridSection = PAGE_SOURCE.match(/grid[^"]*lg:grid-cols-2[^"]*"[\s\S]*?<PromptHealthPanel[\s\S]*?<LearningStorePanel/);
    expect(gridSection).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Bug regression: Panels must have loading and empty states
// ---------------------------------------------------------------------------
describe('Loading and empty states', () => {
  it('PromptHealthPanel has a loading state', () => {
    const panelStart = PAGE_SOURCE.indexOf('function PromptHealthPanel');
    const learningStart = PAGE_SOURCE.indexOf('function LearningStorePanel');
    const healthPanel = PAGE_SOURCE.substring(panelStart, learningStart);

    expect(healthPanel).toContain('isLoading');
    expect(healthPanel).toContain('animate-pulse');
  });

  it('PromptHealthPanel has an empty state message', () => {
    const panelStart = PAGE_SOURCE.indexOf('function PromptHealthPanel');
    const learningStart = PAGE_SOURCE.indexOf('function LearningStorePanel');
    const healthPanel = PAGE_SOURCE.substring(panelStart, learningStart);

    expect(healthPanel).toContain('No sentinel evaluations');
  });

  it('LearningStorePanel has a loading state', () => {
    const panelStart = PAGE_SOURCE.indexOf('function LearningStorePanel');
    const learningPanel = PAGE_SOURCE.substring(panelStart);

    expect(learningPanel).toContain('isLoading');
    expect(learningPanel).toContain('animate-pulse');
  });

  it('LearningStorePanel has an empty state message', () => {
    const panelStart = PAGE_SOURCE.indexOf('function LearningStorePanel');
    const learningPanel = PAGE_SOURCE.substring(panelStart);

    expect(learningPanel).toContain('No rejection patterns recorded');
  });
});

// ---------------------------------------------------------------------------
// Bug regression: getStats must use DB aggregation
// ---------------------------------------------------------------------------
describe('LearningStore.getStats uses DB aggregation', () => {
  it('uses count() not findMany().length', () => {
    const statsMethod = extractMethod(LEARNING_STORE_SOURCE, 'getStats');

    expect(statsMethod).toContain('prisma.learningEntry.count');
    // Should NOT do findMany and then filter in JS
    expect(statsMethod).not.toMatch(/findMany\(\)[\s\S]*?\.filter/);
  });

  it('uses aggregate() for total rejections', () => {
    const statsMethod = extractMethod(LEARNING_STORE_SOURCE, 'getStats');
    expect(statsMethod).toContain('prisma.learningEntry.aggregate');
  });

  it('uses groupBy() for top offenders', () => {
    const statsMethod = extractMethod(LEARNING_STORE_SOURCE, 'getStats');
    expect(statsMethod).toContain('prisma.learningEntry.groupBy');
  });
});

// Source-code-scanning test for recordRejection removed — too fragile.

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function extractMethod(source: string, methodName: string): string {
  // Find "static async methodName(" and grab until the next "static " or end of class
  const pattern = new RegExp(`static\\s+async\\s+${methodName}\\s*\\([\\s\\S]*?(?=\\n\\s+static\\s|\\n\\})`);
  const match = source.match(pattern);
  return match ? match[0] : '';
}
