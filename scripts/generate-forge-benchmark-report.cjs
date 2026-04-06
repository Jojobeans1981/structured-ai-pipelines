const { execFileSync } = require('child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs')
const { dirname, resolve } = require('path')

const benchmarkDir = resolve(process.cwd(), 'benchmarks/forge')
const snapshotsDir = resolve(benchmarkDir, 'snapshots')
const jsonPath = resolve(benchmarkDir, 'latest-report.json')
const summaryPath = resolve(benchmarkDir, 'latest-summary.json')
const markdownPath = resolve(benchmarkDir, 'latest-report.md')
const historyPath = resolve(benchmarkDir, 'history.json')
mkdirSync(dirname(jsonPath), { recursive: true })
mkdirSync(snapshotsDir, { recursive: true })

const vitestArgs = [
  'run',
  'tests/forge-benchmark.test.ts',
  'tests/forge-contracts.test.ts',
  'tests/smoke.test.ts',
  '--reporter=json',
  '--outputFile',
  jsonPath,
]

if (process.platform === 'win32') {
  const vitestCmd = resolve(process.cwd(), 'node_modules/.bin/vitest.cmd')
  execFileSync('cmd.exe', ['/c', vitestCmd, ...vitestArgs], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })
} else {
  const vitestBin = resolve(process.cwd(), 'node_modules/.bin/vitest')
  execFileSync(vitestBin, vitestArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
  })
}

const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'))
const benchmarkSummary = existsSync(summaryPath)
  ? JSON.parse(readFileSync(summaryPath, 'utf-8'))
  : null

const totalSuites = parsed.numTotalTestSuites ?? parsed.testResults?.length ?? 0
const passedSuites = parsed.numPassedTestSuites ?? parsed.testResults?.filter((suite) => suite.status === 'passed').length ?? 0
const totalTests = parsed.numTotalTests ?? 0
const passedTests = parsed.numPassedTests ?? 0
const failedTests = parsed.numFailedTests ?? 0
const success = Boolean(parsed.success)
const generatedAt = new Date()
const timestamp = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const snapshotBase = `forge-benchmark-${timestamp}`
const snapshotJsonPath = resolve(snapshotsDir, `${snapshotBase}.json`)
const snapshotMarkdownPath = resolve(snapshotsDir, `${snapshotBase}.md`)
const history = existsSync(historyPath)
  ? JSON.parse(readFileSync(historyPath, 'utf-8'))
  : { runs: [] }
const previousRun = history.runs[0] || null

function formatDelta(current, previous) {
  if (typeof previous !== 'number') return 'n/a'
  const delta = current - previous
  if (delta === 0) return '0'
  return `${delta > 0 ? '+' : ''}${delta}`
}

function indexCategories(entries) {
  return new Map((entries || []).map((entry) => [entry.category, entry]))
}

function buildCategoryTrend(currentEntries, previousEntries) {
  const currentByCategory = indexCategories(currentEntries)
  const previousByCategory = indexCategories(previousEntries)
  const categories = Array.from(new Set([
    ...currentByCategory.keys(),
    ...previousByCategory.keys(),
  ])).sort((left, right) => left.localeCompare(right))

  return categories.map((category) => {
    const current = currentByCategory.get(category) || null
    const previous = previousByCategory.get(category) || null

    return {
      category,
      statusChanged: previous
        ? current
          ? current.passRate > previous.passRate
            ? 'Improved'
            : current.passRate < previous.passRate
              ? 'Regressed'
              : 'No change'
          : 'Removed'
        : 'New',
      passedDelta: formatDelta(current?.passed ?? 0, previous?.passed),
      totalDelta: formatDelta(current?.total ?? 0, previous?.total),
      passRateDelta: formatDelta(current?.passRate ?? 0, previous?.passRate),
      avgScoreDelta: formatDelta(current?.avgScore ?? 0, previous?.avgScore),
      current: current
        ? {
            passed: current.passed,
            total: current.total,
            passRate: current.passRate,
            avgScore: current.avgScore,
          }
        : null,
    }
  })
}

const trend = previousRun
  ? {
      statusChanged: success ? (previousRun.status === 'PASS' ? 'No change' : 'Improved') : (previousRun.status === 'FAIL' ? 'No change' : 'Regressed'),
      suitesDelta: formatDelta(passedSuites, previousRun.passedSuites),
      testsDelta: formatDelta(passedTests, previousRun.passedTests),
      failedTestsDelta: formatDelta(failedTests, previousRun.failedTests),
    }
  : {
      statusChanged: 'Baseline',
      suitesDelta: 'n/a',
      testsDelta: 'n/a',
      failedTestsDelta: 'n/a',
    }
const categoryTrend = buildCategoryTrend(
  benchmarkSummary?.byCategory || [],
  previousRun?.categories || [],
)

const markdown = [
  '# Forge Benchmark Report',
  '',
  `- Generated at: ${generatedAt.toISOString()}`,
  `- Status: ${success ? 'PASS' : 'FAIL'}`,
  `- Test suites: ${passedSuites}/${totalSuites}`,
  `- Tests: ${passedTests}/${totalTests}`,
  `- Failed tests: ${failedTests}`,
  '',
  '## Included Suites',
  '',
  '- `tests/forge-benchmark.test.ts`',
  '- `tests/forge-contracts.test.ts`',
  '- `tests/smoke.test.ts`',
  '',
  '## Source Artifacts',
  '',
  `- JSON: \`${jsonPath}\``,
  `- Benchmark summary: \`${summaryPath}\``,
  `- Markdown: \`${markdownPath}\``,
  `- Snapshot JSON: \`${snapshotJsonPath}\``,
  `- Snapshot Markdown: \`${snapshotMarkdownPath}\``,
  '',
  '## Trend vs Previous Run',
  '',
  `- Status trend: ${trend.statusChanged}`,
  `- Passed suites delta: ${trend.suitesDelta}`,
  `- Passed tests delta: ${trend.testsDelta}`,
  `- Failed tests delta: ${trend.failedTestsDelta}`,
  '',
  '## Category Trends',
  '',
  '| Category | Status | Passed Delta | Total Delta | Pass Rate Delta | Avg Score Delta | Current |',
  '|---|---|---:|---:|---:|---:|---|',
  ...categoryTrend.map((entry) =>
    `| ${entry.category} | ${entry.statusChanged} | ${entry.passedDelta} | ${entry.totalDelta} | ${entry.passRateDelta} | ${entry.avgScoreDelta} | ${entry.current ? `${entry.current.passed}/${entry.current.total} (${entry.current.passRate}% @ ${entry.current.avgScore}%)` : 'n/a'} |`
  ),
  '',
  '## Next Step',
  '',
  'Expand the benchmark with more repo-backed and end-to-end Forge scenarios while keeping this report stable over time.',
  '',
].join('\n')

writeFileSync(markdownPath, markdown, 'utf-8')
writeFileSync(snapshotJsonPath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8')
writeFileSync(snapshotMarkdownPath, markdown, 'utf-8')

history.runs = [
  {
    generatedAt: generatedAt.toISOString(),
    status: success ? 'PASS' : 'FAIL',
    totalSuites,
    passedSuites,
    totalTests,
    passedTests,
    failedTests,
    latestJson: 'latest-report.json',
    latestMarkdown: 'latest-report.md',
    snapshotJson: `snapshots/${snapshotBase}.json`,
    snapshotMarkdown: `snapshots/${snapshotBase}.md`,
    trend,
    categories: benchmarkSummary?.byCategory || [],
    categoryTrend,
  },
  ...history.runs,
].slice(0, 50)

writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n', 'utf-8')

console.log(`Forge benchmark report written to ${markdownPath}`)
console.log(`Forge benchmark snapshot written to ${snapshotMarkdownPath}`)
console.log(`Forge benchmark history updated at ${historyPath}`)
