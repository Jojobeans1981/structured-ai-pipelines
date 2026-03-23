export interface FixPlanStep {
  file: string
  action: 'create' | 'modify' | 'delete'
  description: string
}

export interface RootCause {
  cause: string
  explanation: string
  affectedFiles: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface FixPlan {
  steps: FixPlanStep[]
  summary: string
}

export interface FixFile {
  path: string
  content: string
}
