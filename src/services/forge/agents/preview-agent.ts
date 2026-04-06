import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import { SkillLoader } from '@/src/services/skill-loader'
import type { ProjectType, VerifyResult } from '@/src/types/dag'
import type { LaunchAssessment } from './launcher-agent'
import { evaluateUsability } from './usability-agent'

interface SandboxSnapshot {
  success: boolean
  phase: string
  stdout: string
  stderr: string
  exitCode: number
  healthCheck?: { reachable: boolean; statusCode?: number }
}

export interface PreviewAssessment {
  ready: boolean
  summary: string
  blockers: string[]
  warnings: string[]
  startCommand: string | null
  expectedPort: number | null
}

const FALLBACK_PROMPT = `You are the Forge Preview Agent.

Your job is to decide whether a generated project is truly previewable, not just theoretically correct.

You receive:
1. The project files
2. The launcher assessment
3. Validation/build/lint/test status
4. Docker sandbox startup evidence when available

Be strict:
- If validation still has unresolved issues, the project is NOT ready
- If build/lint/tests failed, the project is NOT ready
- If sandbox startup or health check failed, the project is NOT ready
- If Docker sandbox is unavailable, you may warn that preview was not mechanically verified

Return ONLY valid JSON:
{
  "ready": false,
  "summary": "Preview blocked by startup failure inside sandbox",
  "blockers": [
    "Sandbox start failed: npm run dev exited immediately",
    "Health check never reached port 3000 or 5173"
  ],
  "warnings": [
    "Preview was inferred from static evidence only"
  ],
  "startCommand": "npm run dev",
  "expectedPort": 5173
}`

function cleanList(values: string[] | undefined): string[] {
  return Array.from(new Set((values || []).map((value) => String(value).trim()).filter(Boolean)))
}

export function finalizePreviewAssessment(opts: {
  files: Array<{ filePath: string; content: string }>
  launchAssessment: LaunchAssessment
  validationIssues: string[]
  buildResult: VerifyResult
  lintPassed: boolean
  testsPassed: boolean
  sandboxAvailable: boolean
  sandboxReason?: string | null
  sandboxResult?: SandboxSnapshot | null
  agentDraft?: Partial<PreviewAssessment> | null
  projectType: ProjectType
}): PreviewAssessment {
  const usability = evaluateUsability({
    files: opts.files,
    projectType: opts.projectType,
    launchAssessment: opts.launchAssessment,
  })

  const blockers = cleanList([
    ...(opts.agentDraft?.blockers || []),
    ...(opts.launchAssessment.ready ? [] : opts.launchAssessment.blockers),
    ...usability.blockers,
    ...opts.validationIssues.map((issue) => `Validation: ${issue}`),
    ...opts.buildResult.errors.map((error) => `Build: ${error}`),
    ...(opts.lintPassed ? [] : ['Lint failed']),
    ...(opts.testsPassed ? [] : ['Tests failed']),
  ])

  const warnings = cleanList([
    ...(opts.agentDraft?.warnings || []),
    ...usability.warnings,
    ...opts.buildResult.warnings,
  ])

  if (!opts.sandboxAvailable && (opts.projectType === 'node' || opts.projectType === 'static')) {
    warnings.push(opts.sandboxReason || 'Docker sandbox unavailable, so preview startup was not mechanically verified')
  }

  if (opts.sandboxResult) {
    if (!opts.sandboxResult.success) {
      const stderr = opts.sandboxResult.stderr.trim()
      blockers.push(
        `Preview sandbox ${opts.sandboxResult.phase} failed` +
        (stderr ? `: ${stderr.slice(0, 200)}` : '')
      )
    } else if (opts.sandboxResult.healthCheck && !opts.sandboxResult.healthCheck.reachable) {
      blockers.push(
        `Preview sandbox health check did not reach the app` +
        (typeof opts.sandboxResult.healthCheck.statusCode === 'number'
          ? ` (status ${opts.sandboxResult.healthCheck.statusCode})`
          : '')
      )
    }
  }

  const summary = opts.agentDraft?.summary?.trim()
    || (blockers.length === 0
      ? 'Project is previewable with the current generated output'
      : blockers[0])

  return {
    ready: blockers.length === 0,
    summary,
    blockers: cleanList(blockers),
    warnings: cleanList(warnings),
    startCommand: opts.agentDraft?.startCommand || opts.launchAssessment.startCommand,
    expectedPort: opts.agentDraft?.expectedPort ?? opts.launchAssessment.expectedPort,
  }
}

export async function evaluatePreviewReadiness(opts: {
  userId: string
  files: Array<{ filePath: string; content: string }>
  projectType: ProjectType
  launchAssessment: LaunchAssessment
  validationIssues: string[]
  buildResult: VerifyResult
  lintPassed: boolean
  testsPassed: boolean
  sandboxAvailable: boolean
  sandboxReason?: string | null
  sandboxResult?: SandboxSnapshot | null
}): Promise<PreviewAssessment> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-preview')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(opts.userId)
  let agentDraft: Partial<PreviewAssessment> | null = null

  try {
    const userMessage = JSON.stringify({
      projectType: opts.projectType,
      launchAssessment: opts.launchAssessment,
      validationIssues: opts.validationIssues,
      buildResult: {
        success: opts.buildResult.success,
        errors: opts.buildResult.errors,
        warnings: opts.buildResult.warnings,
      },
      lintPassed: opts.lintPassed,
      testsPassed: opts.testsPassed,
      sandboxAvailable: opts.sandboxAvailable,
      sandboxReason: opts.sandboxReason ?? null,
      sandboxResult: opts.sandboxResult ?? null,
      files: opts.files,
    }, null, 2)

    const response = await callWithRetry(() =>
      createWithFallback(client, {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
    )

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      agentDraft = JSON.parse(jsonMatch[0]) as Partial<PreviewAssessment>
    }
  } catch {
    agentDraft = null
  }

  return finalizePreviewAssessment({
    files: opts.files,
    launchAssessment: opts.launchAssessment,
    validationIssues: opts.validationIssues,
    buildResult: opts.buildResult,
    lintPassed: opts.lintPassed,
    testsPassed: opts.testsPassed,
    sandboxAvailable: opts.sandboxAvailable,
    sandboxReason: opts.sandboxReason,
    sandboxResult: opts.sandboxResult,
    agentDraft,
    projectType: opts.projectType,
  })
}
