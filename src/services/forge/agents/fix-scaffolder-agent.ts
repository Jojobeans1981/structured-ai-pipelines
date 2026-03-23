import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import type { FixPlanStep, RootCause, FixFile } from '../types/fix'
import { SkillLoader } from '@/src/services/skill-loader'

const FALLBACK_PROMPT = `You are a targeted bug fixer. Generate the corrected file content for a single fix step.

Rules:
1. Output ONLY the complete file content — no markdown fences, no explanations
2. Preserve ALL existing functionality — only change what's needed to fix the bug
3. Add appropriate error handling around the fix
4. No hardcoded secrets or tokens
5. Match the existing code style exactly
6. If the action is "create", generate the entire new file
7. If the action is "modify", output the COMPLETE modified file (not a diff)

Generate the complete corrected file content.`

export async function scaffoldFix(
  userId: string,
  step: FixPlanStep,
  existingContent: string | null,
  rootCause: RootCause,
): Promise<FixFile> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-fix-scaffolder')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(userId)

  const userMessage = [
    '## Fix Step\n',
    `File: ${step.file}`,
    `Action: ${step.action}`,
    `Description: ${step.description}`,
    '\n\n## Root Cause\n',
    `Cause: ${rootCause.cause}`,
    `Explanation: ${rootCause.explanation}`,
    existingContent
      ? `\n\n## Existing File Content\n\n${existingContent}`
      : '\n\n(New file — no existing content)',
  ].join('\n')

  const response = await callWithRetry(() =>
    createWithFallback(client, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })
  )

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  // Strip code fences if present
  const fenceMatch = text.match(/```(?:\w+)?\n([\s\S]*?)```/)
  const content = fenceMatch ? fenceMatch[1].trim() : text.trim()

  return { path: step.file, content }
}
