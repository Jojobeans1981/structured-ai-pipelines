import { describe, expect, it } from 'vitest'
import { rmSync } from 'fs'
import {
  listForgeLiveLiteScenarios,
  materializeLiveLiteScenarioRepo,
} from '../src/services/forge/live-lite-executor'

describe('Forge live-lite executor', () => {
  it('materializes seeded benchmark repos as git repos on disk', () => {
    const scenario = listForgeLiveLiteScenarios().find((entry) => entry.id === 'repo-recovery-vite-import')
    expect(scenario).toBeTruthy()

    const repoDir = materializeLiveLiteScenarioRepo(scenario!)

    try {
      expect(repoDir).toContain('forge-live-lite')
    } finally {
      rmSync(require('path').join(repoDir, '..'), { recursive: true, force: true })
    }
  })

  it('lists the fixed executable live-lite scenarios', () => {
    const scenarios = listForgeLiveLiteScenarios()

    expect(scenarios.map((scenario) => scenario.id)).toContain('greenfield-focus-board')
    expect(scenarios.map((scenario) => scenario.id)).toContain('repo-recovery-vite-import')
    expect(scenarios.map((scenario) => scenario.id)).toContain('weekly-commit-module-strategy')
  })
})
