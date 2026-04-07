import { describe, expect, it } from 'vitest'
import {
  formatForgeLiveLitePlanMarkdown,
  getForgeLiveLitePlan,
} from '../src/services/forge/live-lite-benchmark'

describe('Forge live-lite benchmark plan', () => {
  it('defines a stable set of live-lite benchmark scenarios', () => {
    const plan = getForgeLiveLitePlan()

    expect(plan.scenarios.length).toBeGreaterThanOrEqual(3)
    expect(plan.scenarios.map((scenario) => scenario.id)).toContain('greenfield-focus-board')
    expect(plan.scenarios.map((scenario) => scenario.id)).toContain('repo-recovery-vite-import')
    expect(plan.scenarios.map((scenario) => scenario.id)).toContain('weekly-commit-module-strategy')
  })

  it('includes a required scorecard for real Forge execution', () => {
    const plan = getForgeLiveLitePlan()
    const requiredDimensions = plan.scorecard.filter((entry) => entry.required).map((entry) => entry.dimension)

    expect(requiredDimensions).toContain('buildable')
    expect(requiredDimensions).toContain('previewable')
    expect(requiredDimensions).toContain('artifact-completeness')
    expect(requiredDimensions).toContain('guardrail-behavior')
  })

  it('renders a stable markdown plan for mentor-facing review', () => {
    const markdown = formatForgeLiveLitePlanMarkdown(getForgeLiveLitePlan())

    expect(markdown).toContain('# Forge Live-Lite Benchmark Plan')
    expect(markdown).toContain('## Scorecard')
    expect(markdown).toContain('## Scenarios')
    expect(markdown).toContain('Weekly Commit Module Strategy Build')
  })
})
