import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/src/lib/prisma', () => import('./__mocks__/prisma'))

import { claimForgeRun, getForgeRunStageData, saveForgeRunStageData } from '../src/services/forge/db'
import { prisma } from './__mocks__/prisma'

describe('Forge DB helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims a run only when the atomic status transition updates one row', async () => {
    prisma.forgeRun.updateMany.mockResolvedValueOnce({ count: 1 })
    await expect(
      claimForgeRun('run-1', 'user-1', { status: 'pending' }, { status: 'running', stage: null }),
    ).resolves.toBe(true)

    expect(prisma.forgeRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run-1', userId: 'user-1', status: 'pending' },
      data: { status: 'running', stage: null },
    })
  })

  it('returns false when another request already claimed the run', async () => {
    prisma.forgeRun.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(
      claimForgeRun('run-1', 'user-1', { status: 'pending' }, { status: 'running' }),
    ).resolves.toBe(false)
  })

  it('persists and reads stage data from ForgeRun', async () => {
    const stageData = { kind: 'build', version: 1 }
    prisma.forgeRun.update.mockResolvedValueOnce({ id: 'run-1', stageData })
    prisma.forgeRun.findUnique.mockResolvedValueOnce({ stageData })

    await saveForgeRunStageData('run-1', stageData)
    await expect(getForgeRunStageData('run-1')).resolves.toEqual(stageData)
  })
})
