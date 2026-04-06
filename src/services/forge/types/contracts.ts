import { z } from 'zod'
import { ConventionsProfileSchema } from './conventions'

const nonEmptyTrimmed = z.string().trim().min(1)

export const PRDOutputSchema = z.object({
  title: nonEmptyTrimmed,
  summary: nonEmptyTrimmed,
  fullText: nonEmptyTrimmed,
})

export const ManifestFileSchema = z.object({
  path: nonEmptyTrimmed,
  description: nonEmptyTrimmed,
  dependencies: z.array(nonEmptyTrimmed).default([]),
})

export const ImplementationManifestSchema = z.object({
  files: z.array(ManifestFileSchema).min(1),
})

export const ValidationIssueSchema = z.object({
  phase: nonEmptyTrimmed,
  description: nonEmptyTrimmed,
})

export const ValidationFixSchema = z.object({
  file: nonEmptyTrimmed,
  description: nonEmptyTrimmed,
  content: z.string(),
})

export const ValidationResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(ValidationIssueSchema),
  fixes: z.array(ValidationFixSchema),
}).superRefine((value, ctx) => {
  if (value.passed && value.issues.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['issues'],
      message: 'A passing validation result must not contain blocking issues.',
    })
  }
})

export const LaunchAssessmentSchema = z.object({
  projectType: nonEmptyTrimmed,
  framework: z.string().nullable(),
  installCommand: z.string().nullable(),
  startCommand: z.string().nullable(),
  expectedPort: z.number().int().positive().nullable(),
  ready: z.boolean(),
  blockers: z.array(nonEmptyTrimmed),
  missingPackages: z.array(nonEmptyTrimmed),
  summary: nonEmptyTrimmed,
}).superRefine((value, ctx) => {
  if (value.ready === false && value.blockers.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blockers'],
      message: 'A non-ready launch assessment must explain at least one blocker.',
    })
  }
})

export const PreviewAssessmentSchema = z.object({
  ready: z.boolean(),
  summary: nonEmptyTrimmed,
  blockers: z.array(nonEmptyTrimmed),
  warnings: z.array(nonEmptyTrimmed),
  startCommand: z.string().nullable(),
  expectedPort: z.number().int().positive().nullable(),
}).superRefine((value, ctx) => {
  if (value.ready === false && value.blockers.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blockers'],
      message: 'A non-previewable assessment must include at least one blocker.',
    })
  }
})

export const FixPlanStepSchema = z.object({
  file: nonEmptyTrimmed,
  action: z.enum(['create', 'modify', 'delete']),
  description: nonEmptyTrimmed,
})

export const FixPlanSchema = z.object({
  steps: z.array(FixPlanStepSchema),
  summary: nonEmptyTrimmed,
})

export const ForgeStepContractSchema = z.object({
  step: nonEmptyTrimmed,
  purpose: nonEmptyTrimmed,
  inputSchema: nonEmptyTrimmed,
  outputSchema: nonEmptyTrimmed,
  successCriteria: z.array(nonEmptyTrimmed).min(1),
  blockingCriteria: z.array(nonEmptyTrimmed).min(1),
})

export const FORGE_STEP_CONTRACTS = [
  {
    step: 'Analyze Repo',
    purpose: 'Infer conventions and execution constraints from the repository before planning.',
    inputSchema: 'Directory tree + representative code samples',
    outputSchema: 'ConventionsProfileSchema',
    successCriteria: [
      'Language and framework are identified.',
      'Build, lint, and test commands are inferred when evidence exists.',
    ],
    blockingCriteria: [
      'The conventions profile cannot be parsed.',
      'The repo shape is too ambiguous to continue safely.',
    ],
  },
  {
    step: 'Generate PRD',
    purpose: 'Produce a concrete implementation target for downstream planning.',
    inputSchema: 'Spec text + conventions profile',
    outputSchema: 'PRDOutputSchema',
    successCriteria: [
      'The PRD has a title, summary, and actionable full text.',
      'The PRD aligns with the inferred repository conventions.',
    ],
    blockingCriteria: [
      'The PRD payload is empty.',
      'The PRD cannot be parsed into the contract schema.',
    ],
  },
  {
    step: 'Generate Manifest',
    purpose: 'Define the file-level implementation plan with explicit dependencies.',
    inputSchema: 'PRD + conventions profile',
    outputSchema: 'ImplementationManifestSchema',
    successCriteria: [
      'Every file has a path, description, and dependency list.',
      'Dependencies reference files that exist in the manifest.',
    ],
    blockingCriteria: [
      'The manifest contains duplicate paths.',
      'The manifest contains cycles or missing dependency targets.',
    ],
  },
  {
    step: 'Validate Output',
    purpose: 'Catch structural and semantic problems before build and preview checks.',
    inputSchema: 'Generated files',
    outputSchema: 'ValidationResultSchema',
    successCriteria: [
      'A passing result has no blocking issues.',
      'A failing result returns explicit issues and concrete file fixes when possible.',
    ],
    blockingCriteria: [
      'Validation reports unresolved issues.',
      'Validation returns an unparseable payload.',
    ],
  },
  {
    step: 'Launch Readiness',
    purpose: 'Judge whether the generated project should be able to start.',
    inputSchema: 'Generated files + conventions profile',
    outputSchema: 'LaunchAssessmentSchema',
    successCriteria: [
      'The start command and expected port are explicit when applicable.',
      'Any non-ready decision includes concrete blockers.',
    ],
    blockingCriteria: [
      'No startup command can be identified.',
      'The assessment is not parseable or omits blockers for a non-ready state.',
    ],
  },
  {
    step: 'Preview Readiness',
    purpose: 'Require real evidence that the output is previewable, not just plausible.',
    inputSchema: 'Launch assessment + validation/build/test status + sandbox evidence',
    outputSchema: 'PreviewAssessmentSchema',
    successCriteria: [
      'Preview-ready only when validation, build, and runtime checks all clear.',
      'Warnings explain when runtime verification could not be performed.',
    ],
    blockingCriteria: [
      'Sandbox startup fails.',
      'Health checks never reach the app.',
    ],
  },
  {
    step: 'Repair Planning',
    purpose: 'Translate blockers into concrete file-level repairs.',
    inputSchema: 'Bug report or readiness blockers + code map',
    outputSchema: 'FixPlanSchema',
    successCriteria: [
      'Each repair step identifies a file, action, and reason.',
      'The fix plan summary explains the strategy in plain language.',
    ],
    blockingCriteria: [
      'No repair steps can be proposed for a failing artifact.',
      'The plan cannot be parsed into discrete file actions.',
    ],
  },
] as const satisfies z.infer<typeof ForgeStepContractSchema>[]

export const ForgeStepContractsSchema = z.array(ForgeStepContractSchema)

export function validateImplementationManifestContract(input: unknown) {
  const manifest = ImplementationManifestSchema.parse(input)
  const fileMap = new Map<string, z.infer<typeof ManifestFileSchema>>()

  for (const file of manifest.files) {
    if (fileMap.has(file.path)) {
      throw new Error(`Duplicate manifest path: ${file.path}`)
    }
    fileMap.set(file.path, file)
  }

  for (const file of manifest.files) {
    for (const dep of file.dependencies) {
      if (!fileMap.has(dep)) {
        throw new Error(`Manifest dependency "${dep}" for "${file.path}" is missing`)
      }
    }
  }

  return manifest
}

export const ForgeSpecHarnessSchema = z.object({
  conventions: ConventionsProfileSchema.optional(),
  prd: PRDOutputSchema.optional(),
  manifest: ImplementationManifestSchema.optional(),
  validation: ValidationResultSchema.optional(),
  launch: LaunchAssessmentSchema.optional(),
  preview: PreviewAssessmentSchema.optional(),
  fixPlan: FixPlanSchema.optional(),
})

export type PRDOutputContract = z.infer<typeof PRDOutputSchema>
export type ManifestFileContract = z.infer<typeof ManifestFileSchema>
export type ImplementationManifestContract = z.infer<typeof ImplementationManifestSchema>
export type ValidationResultContract = z.infer<typeof ValidationResultSchema>
export type LaunchAssessmentContract = z.infer<typeof LaunchAssessmentSchema>
export type PreviewAssessmentContract = z.infer<typeof PreviewAssessmentSchema>
export type FixPlanContract = z.infer<typeof FixPlanSchema>
