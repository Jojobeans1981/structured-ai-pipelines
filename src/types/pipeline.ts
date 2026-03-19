export type PipelineType = 'build' | 'diagnostic' | 'refactor' | 'enhance' | 'test' | 'deploy';
export type RunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'planning';
export type StageStatus = 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'rejected' | 'skipped' | 'failed' | 'retrying';
export type ExecutionMode = 'linear' | 'dag';

export interface PipelineStageDefinition {
  skillName: string;
  displayName: string;
  description: string;
}

// Legacy linear stage definitions (backward compatible)
export const BUILD_PIPELINE_STAGES: PipelineStageDefinition[] = [
  { skillName: 'prd-architect', displayName: 'PRD Generation', description: 'Generate complete Product Requirements Document' },
  { skillName: 'phase-builder', displayName: 'Phase Extraction', description: 'Extract standalone phase documents from PRD' },
  { skillName: 'prompt-builder', displayName: 'Prompt Generation', description: 'Generate atomic implementation prompts' },
  { skillName: 'prompt-validator', displayName: 'Prompt Validation', description: 'Validate prompts against codebase state' },
  { skillName: 'phase-executor', displayName: 'Code Execution', description: 'Execute prompts into working code' },
];

export const DIAGNOSTIC_PIPELINE_STAGES: PipelineStageDefinition[] = [
  { skillName: 'bug-intake', displayName: 'Bug Intake', description: 'Collect and structure bug information' },
  { skillName: 'code-archaeologist', displayName: 'Code Archaeology', description: 'Trace bug through codebase' },
  { skillName: 'root-cause-analyzer', displayName: 'Root Cause Analysis', description: 'Identify definitive root cause' },
  { skillName: 'fix-planner', displayName: 'Fix Planning', description: 'Design minimal fix with ordered steps' },
  { skillName: 'fix-prompt-builder', displayName: 'Fix Prompt Generation', description: 'Generate atomic fix instructions' },
  { skillName: 'prompt-validator', displayName: 'Fix Validation', description: 'Validate fix prompts against codebase' },
  { skillName: 'fix-executor', displayName: 'Fix Execution', description: 'Apply and verify the fix' },
  { skillName: 'lessons-learned', displayName: 'Lessons Learned', description: 'Extract prevention recommendations' },
];
