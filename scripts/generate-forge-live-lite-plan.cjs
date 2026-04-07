const { mkdirSync, readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')

const benchmarkDir = resolve(process.cwd(), 'benchmarks/forge')
const fixturesPath = resolve(benchmarkDir, 'live-lite-cases.json')
const outputPath = resolve(benchmarkDir, 'live-lite-plan.md')

const scorecard = [
  {
    dimension: 'buildable',
    description: 'The run produces a dependency-clean project that can install and build successfully.',
    required: true,
  },
  {
    dimension: 'previewable',
    description: 'The run produces a project that passes preview preflight and avoids false-ready launch states.',
    required: true,
  },
  {
    dimension: 'artifact-completeness',
    description: 'The final artifact set includes required entrypoints, startup scripts, and framework scaffolding.',
    required: true,
  },
  {
    dimension: 'guardrail-behavior',
    description: 'Delivery guard and verification gates route broken output back through repair instead of promoting it.',
    required: true,
  },
  {
    dimension: 'scenario-intent',
    description: 'The output reflects the scenario’s expected signals, such as strategy alignment, dashboarding, or repo recovery.',
    required: false,
  },
]

const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf-8'))
const scenarios = fixtures.scenarios || []

const markdown = [
  '# Forge Live-Lite Benchmark Plan',
  '',
  `- Scenarios: ${scenarios.length}`,
  `- Required score dimensions: ${scorecard.filter((entry) => entry.required).length}/${scorecard.length}`,
  '',
  '## Scorecard',
  '',
  '| Dimension | Required | Description |',
  '|---|---|---|',
  ...scorecard.map((entry) =>
    `| ${entry.dimension} | ${entry.required ? 'Yes' : 'No'} | ${entry.description} |`
  ),
  '',
  '## Scenarios',
  '',
  ...scenarios.flatMap((scenario) => [
    `### ${scenario.name}`,
    `- ID: ${scenario.id}`,
    `- Type: ${scenario.type}`,
    `- Repo URL: ${scenario.repoUrl}`,
    `- Spec File: ${scenario.specFilename}`,
    `- Expected signals: ${scenario.expectedSignals.join(', ')}`,
    `- Prompt: ${scenario.specContent}`,
    '',
  ]),
].join('\n')

mkdirSync(benchmarkDir, { recursive: true })
writeFileSync(outputPath, markdown.trim() + '\n', 'utf-8')
console.log(`Forge live-lite benchmark plan written to ${outputPath}`)
