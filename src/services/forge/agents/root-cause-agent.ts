import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import type { BugReport, CodeMap } from '../types/bug'
import type { RootCause } from '../types/fix'
import { SkillLoader } from '@/src/services/skill-loader'

const FALLBACK_PROMPT = `You are a root cause analyst. Given a bug report and code map, identify the definitive root cause of the bug.

Analyze the evidence and determine:
1. cause: one-sentence statement of the root cause
2. explanation: detailed explanation of WHY this root cause produces the observed behavior
3. affectedFiles: all files that need changes to fix this
4. confidence: "high" (clear evidence), "medium" (likely but uncertain), or "low" (speculative)

Focus on the ACTUAL root cause, not just the symptom. The symptom is what the user sees; the root cause is the defect in the code that produces it.

Return ONLY valid JSON:
{
  "cause": "The database connection pool exhausts because connections are never released after query timeout",
  "explanation": "When a query takes longer than 5s, the timeout handler aborts the query but does not call connection.release(). Over time, all pool connections become zombie connections...",
  "affectedFiles": ["src/db/pool.ts", "src/db/query.ts"],
  "confidence": "high"
}

No markdown fences, no explanation. Just JSON.`

export async function analyzeRootCause(
  userId: string,
  bugReport: BugReport,
  codeMap: CodeMap,
): Promise<RootCause> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-root-cause')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(userId)

  const userMessage = [
    '## Bug Report\n',
    `Description: ${bugReport.description}`,
    `Error Logs: ${bugReport.errorLogs}`,
    `Symptoms: ${bugReport.symptoms}`,
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
  if (!jsonMatch) throw new Error('Root cause agent returned no JSON')

  const parsed = JSON.parse(jsonMatch[0])

  return {
    cause: parsed.cause || 'Unknown',
    explanation: parsed.explanation || '',
    affectedFiles: Array.isArray(parsed.affectedFiles) ? parsed.affectedFiles : [],
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
  }
}
