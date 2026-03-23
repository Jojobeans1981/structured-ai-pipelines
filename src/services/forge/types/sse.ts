import type { FixPlanStep } from './fix'

export interface SSELogEvent {
  type: 'log'
  step: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

export interface SSEPlanEvent {
  type: 'plan'
  stage: 'plan'
  // Build mode fields
  prdTitle?: string
  prdSummary?: string
  prdFullText?: string
  // Debug mode fields
  rootCause?: string
  affectedFiles?: string[]
  fixPlan?: FixPlanStep[]
}

export interface SSEDiagnosisEvent {
  type: 'diagnosis'
  rootCause: string
  affectedFiles: string[]
  fixPlan: FixPlanStep[]
}

export interface SSEDiffEvent {
  type: 'diff'
  files: Array<{ path: string; content: string }>
  lintPassed: boolean
  testsPassed: boolean
  errors: string[]
}

export interface SSEStatusEvent {
  type: 'status'
  status: string
  stage?: string
}

export interface SSEDoneEvent {
  type: 'done'
}

export type SSEEvent =
  | SSELogEvent
  | SSEPlanEvent
  | SSEDiagnosisEvent
  | SSEDiffEvent
  | SSEStatusEvent
  | SSEDoneEvent
