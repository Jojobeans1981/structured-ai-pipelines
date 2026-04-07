import liveLiteFixtures from '../../../benchmarks/forge/live-lite-cases.json'

export interface ForgeLiveLiteScenario {
  id: string
  name: string
  type: 'greenfield' | 'repo-recovery' | 'strategic-module'
  repoUrl: string
  specFilename: string
  specContent: string
  expectedSignals: string[]
}

export interface ForgeLiveLiteScorecard {
  dimension: string
  description: string
  required: boolean
}

export interface ForgeLiveLitePlan {
  scenarios: ForgeLiveLiteScenario[]
  scorecard: ForgeLiveLiteScorecard[]
}

const LIVE_LITE_SCORECARD: ForgeLiveLiteScorecard[] = [
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

export function getForgeLiveLitePlan(): ForgeLiveLitePlan {
  return {
    scenarios: [...(liveLiteFixtures.scenarios as ForgeLiveLiteScenario[])],
    scorecard: LIVE_LITE_SCORECARD,
  }
}

export function formatForgeLiveLitePlanMarkdown(plan: ForgeLiveLitePlan): string {
  const lines: string[] = [
    '# Forge Live-Lite Benchmark Plan',
    '',
    `- Scenarios: ${plan.scenarios.length}`,
    `- Required score dimensions: ${plan.scorecard.filter((entry) => entry.required).length}/${plan.scorecard.length}`,
    '',
    '## Scorecard',
    '',
    '| Dimension | Required | Description |',
    '|---|---|---|',
    ...plan.scorecard.map((entry) =>
      `| ${entry.dimension} | ${entry.required ? 'Yes' : 'No'} | ${entry.description} |`
    ),
    '',
    '## Scenarios',
    '',
  ]

  for (const scenario of plan.scenarios) {
    lines.push(`### ${scenario.name}`)
    lines.push(`- ID: ${scenario.id}`)
    lines.push(`- Type: ${scenario.type}`)
    lines.push(`- Repo URL: ${scenario.repoUrl}`)
    lines.push(`- Spec File: ${scenario.specFilename}`)
    lines.push(`- Expected signals: ${scenario.expectedSignals.join(', ')}`)
    lines.push(`- Prompt: ${scenario.specContent}`)
    lines.push('')
  }

  return lines.join('\n').trim()
}
