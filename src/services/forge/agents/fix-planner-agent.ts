import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import type { BugReport, CodeMap } from '../types/bug'
import type { RootCause, FixPlan } from '../types/fix'
import { SkillLoader } from '@/src/services/skill-loader'

const FALLBACK_PROMPT = `You are a fix planner. Given a bug report, root cause analysis, and code map, plan the minimal set of file changes needed to fix the bug.

Rules:
1. Prefer targeted, minimal fixes over broad refactors
2. Order steps so dependencies are resolved first (e.g., create a utility before the file that imports it)
3. Each step specifies: file (path), action ("create" | "modify" | "delete"), description (what to change and why)
4. Include a summary of the overall fix approach

Return ONLY valid JSON:
{
  "steps": [
    { "file": "src/db/pool.ts", "action": "modify", "description": "Add connection.release() call in the timeout handler's catch block" },
    { "file": "src/db/query.ts", "action": "modify", "description": "Wrap query execution in try-finally to ensure connection release" }
  ],
  "summary": "Fix connection leak by ensuring connections are released in all code paths, including timeout and error scenarios"
}

No markdown fences, no explanation. Just JSON.`

export async function planFix(
  userId: string,
  bugReport: BugReport,
  rootCause: RootCause,
  codeMap: CodeMap,
): Promise<FixPlan> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-fix-planner')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(userId)

  const userMessage = [
    '## Bug Report\n',
    `Description: ${bugReport.description}`,
    `Error Logs: ${bugReport.errorLogs}`,
    `Symptoms: ${bugReport.symptoms}`,
    '\n\n## Root Cause\n',
    JSON.stringify(rootCause, null, 2),
    '\n\n## Code Map\n',
    JSON.stringify(codeMap, null, 2),
  ].join('\n')

  const response = await callWithRetry(() =>
    createWithFallback(client, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })
  )

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Fix planner agent returned no JSON')

  const parsed = JSON.parse(jsonMatch[0])

  return {
    steps: Array.isArray(parsed.steps)
      ? parsed.steps.map((s: Record<string, string>) => ({
          file: s.file || '',
          action: (['create', 'modify', 'delete'].includes(s.action) ? s.action : 'modify') as 'create' | 'modify' | 'delete',
          description: s.description || '',
        }))
      : [],
    summary: parsed.summary || '',
  }
}
