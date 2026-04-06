import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { runForgeBenchmarkSuite } from '../src/services/forge/benchmark'
import { formatForgeBenchmarkSummaryMarkdown } from '../src/services/forge/benchmark-report'

const benchmarkDir = resolve(process.cwd(), 'benchmarks/forge')
const summaryArtifactPath = resolve(benchmarkDir, 'latest-summary.json')

describe('Forge benchmark suite', () => {
  it('produces a stable benchmark summary with all baseline cases passing', () => {
    const summary = runForgeBenchmarkSuite()

    expect(summary.totalCases).toBeGreaterThanOrEqual(5)
    expect(summary.failedCases).toBe(0)
    expect(summary.passRate).toBe(100)
    expect(summary.avgScore).toBe(100)
    expect(summary.byCategory.length).toBeGreaterThanOrEqual(4)
  })

  it('includes preview-readiness and planning categories in the benchmark mix', () => {
    const summary = runForgeBenchmarkSuite()
    const categories = summary.byCategory.map((entry) => entry.category)

    expect(categories).toContain('preview-readiness')
    expect(categories).toContain('planning')
    expect(categories).toContain('engine-compatibility')
  })

  it('renders a shareable markdown summary', () => {
    const summary = runForgeBenchmarkSuite()
    const markdown = formatForgeBenchmarkSummaryMarkdown(summary)

    expect(markdown).toContain('# Forge Benchmark Summary')
    expect(markdown).toContain('## Category Scores')
    expect(markdown).toContain('## Case Results')
    expect(markdown).toContain('preview-readiness')
  })

  it('writes a structured summary artifact for report generation', () => {
    const summary = runForgeBenchmarkSuite()

    mkdirSync(benchmarkDir, { recursive: true })
    writeFileSync(summaryArtifactPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8')

    expect(summary.byCategory.length).toBeGreaterThan(0)
  })
})
