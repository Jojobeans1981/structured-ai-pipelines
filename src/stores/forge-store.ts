'use client'

import { create } from 'zustand'
import type { FixPlanStep } from '@/src/services/forge/types/fix'

interface ForgeRunLog {
  step: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

interface ForgeDiff {
  files: Array<{ path: string; content: string }>
  lintPassed: boolean
  testsPassed: boolean
  errors: string[]
}

interface ForgeDiagnosis {
  rootCause: string
  affectedFiles: string[]
  fixPlan: FixPlanStep[]
}

interface ForgePlanData {
  prdTitle?: string
  prdSummary?: string
  prdFullText?: string
  rootCause?: string
  affectedFiles?: string[]
  fixPlan?: FixPlanStep[]
}

interface ForgeResult {
  mrUrl: string
  mrIid: number
  branch: string
  title: string
}

interface ForgeState {
  status: string
  stage: string | null
  logs: ForgeRunLog[]
  diff: ForgeDiff | null
  diagnosis: ForgeDiagnosis | null
  result: ForgeResult | null
  planData: ForgePlanData | null
  advanceStreamUrl: string | null

  setStatus: (status: string) => void
  setStage: (stage: string | null) => void
  addLog: (log: ForgeRunLog) => void
  setDiff: (diff: ForgeDiff) => void
  setDiagnosis: (diagnosis: ForgeDiagnosis) => void
  setResult: (result: ForgeResult) => void
  setPlanData: (data: ForgePlanData) => void
  hydrateRun: (data: {
    status: string
    stage: string | null
    logs: ForgeRunLog[]
    diff: ForgeDiff | null
    diagnosis: ForgeDiagnosis | null
    result: ForgeResult | null
    planData?: ForgePlanData | null
  }) => void
  triggerAdvance: (runId: string) => void
  reset: () => void
}

export const useForgeStore = create<ForgeState>((set) => ({
  status: 'pending',
  stage: null,
  logs: [],
  diff: null,
  diagnosis: null,
  result: null,
  planData: null,
  advanceStreamUrl: null,

  setStatus: (status) => set({ status }),
  setStage: (stage) => set({ stage }),
  addLog: (log) => set((s) => ({ logs: [...s.logs, log] })),
  setDiff: (diff) => set({ diff }),
  setDiagnosis: (diagnosis) => set({ diagnosis }),
  setResult: (result) => set({ result }),
  setPlanData: (data) => set({ planData: data }),
  hydrateRun: (data) => set({
    status: data.status,
    stage: data.stage,
    logs: data.logs,
    diff: data.diff,
    diagnosis: data.diagnosis,
    result: data.result,
    planData: data.planData ?? null,
    advanceStreamUrl: null,
  }),
  triggerAdvance: (runId) => set({
    status: 'running',
    stage: null,
    planData: null,
    advanceStreamUrl: `/api/forge/runs/${runId}/advance`,
  }),
  reset: () => set({
    status: 'pending',
    stage: null,
    logs: [],
    diff: null,
    diagnosis: null,
    result: null,
    planData: null,
    advanceStreamUrl: null,
  }),
}))
