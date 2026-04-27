import { beforeEach, describe, expect, it } from 'vitest'
import { useForgeStore } from '../src/stores/forge-store'

describe('Forge store hydration', () => {
  beforeEach(() => {
    useForgeStore.getState().reset()
  })

  it('replaces server-provided run state instead of appending stale logs', () => {
    useForgeStore.getState().addLog({
      step: 'old-run',
      level: 'info',
      message: 'stale log',
    })

    const runState = {
      status: 'awaiting_approval',
      stage: 'plan',
      logs: [
        { step: 'Analyzer', level: 'success' as const, message: 'Repo analyzed' },
      ],
      diff: null,
      diagnosis: null,
      result: null,
    }

    useForgeStore.getState().hydrateRun(runState)
    useForgeStore.getState().hydrateRun(runState)

    expect(useForgeStore.getState().logs).toEqual(runState.logs)
    expect(useForgeStore.getState().status).toBe('awaiting_approval')
    expect(useForgeStore.getState().stage).toBe('plan')
  })

  it('clears an advance stream when a new run is hydrated', () => {
    useForgeStore.getState().triggerAdvance('run-123')
    expect(useForgeStore.getState().advanceStreamUrl).toBe('/api/forge/runs/run-123/advance')

    useForgeStore.getState().hydrateRun({
      status: 'complete',
      stage: null,
      logs: [],
      diff: null,
      diagnosis: null,
      result: {
        mrUrl: 'https://example.com/mr/1',
        mrIid: 1,
        branch: 'forge/build-run-123',
        title: 'Ship the thing',
      },
    })

    expect(useForgeStore.getState().advanceStreamUrl).toBeNull()
  })
})
