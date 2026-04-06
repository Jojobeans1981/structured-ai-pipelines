import type { ForgeBenchmarkSummary } from './benchmark'

export function formatForgeBenchmarkSummaryMarkdown(summary: ForgeBenchmarkSummary): string {
  const lines: string[] = [
    '# Forge Benchmark Summary',
    '',
    `- Total cases: ${summary.totalCases}`,
    `- Passed: ${summary.passedCases}`,
    `- Failed: ${summary.failedCases}`,
    `- Pass rate: ${summary.passRate}%`,
    `- Average score: ${summary.avgScore}%`,
    '',
    '## Category Scores',
    '',
    '| Category | Passed | Total | Pass Rate | Avg Score |',
    '|---|---:|---:|---:|---:|',
    ...summary.byCategory.map((entry) =>
      `| ${entry.category} | ${entry.passed} | ${entry.total} | ${entry.passRate}% | ${entry.avgScore}% |`
    ),
    '',
    '## Case Results',
    '',
  ]

  for (const testCase of summary.cases) {
    lines.push(`### ${testCase.name}`)
    lines.push(`- ID: ${testCase.id}`)
    lines.push(`- Category: ${testCase.category}`)
    lines.push(`- Status: ${testCase.passed ? 'PASS' : 'FAIL'}`)
    lines.push(`- Score: ${testCase.score}%`)
    lines.push('- Checks:')
    for (const detail of testCase.details) {
      lines.push(`  - ${detail}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}
