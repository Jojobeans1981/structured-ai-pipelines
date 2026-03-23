import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import type { BugReport, CodeMap } from '../types/bug'
import { SkillLoader } from '@/src/services/skill-loader'

const FALLBACK_PROMPT = `You are a code archaeologist. Given a bug report and repository code, map the affected files, code locations, call chains, and entry points.

Analyze the bug description, error logs, and symptoms against the directory tree and code samples. Identify:
1. affectedFiles: array of file paths that are involved in the bug
2. locations: array of specific code locations, each with: file, lines (e.g., "42-58"), relevance (why this location matters), snippet (the relevant code)
3. callChain: string describing the execution flow from entry point to bug manifestation
4. entryPoint: the file/function where execution begins for this bug path

Return ONLY valid JSON matching this shape:
{
  "affectedFiles": ["src/foo.ts", "src/bar.ts"],
  "locations": [
    { "file": "src/foo.ts", "lines": "42-58", "relevance": "This is where the null check is missing", "snippet": "const result = data.value.toString()" }
  ],
  "callChain": "main.ts → router.handle() → foo.process() → bar.transform()",
  "entryPoint": "src/main.ts:handleRequest()"
}

No markdown fences, no explanation. Just JSON.`

export async function mapCodePaths(
  userId: string,
  bugReport: BugReport,
  tree: string,
  codeSamples: string[],
): Promise<CodeMap> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-archaeologist')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(userId)

  const userMessage = [
    '## Bug Report\n',
    `Description: ${bugReport.description}`,
    `Error Logs: ${bugReport.errorLogs}`,
    `Symptoms: ${bugReport.symptoms}`,
    '\n\n## Directory Tree\n',
    tree,
    '\n\n## Code Samples\n',
    codeSamples.join('\n\n---\n\n'),
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
  if (!jsonMatch) throw new Error('Archaeologist agent returned no JSON')

  const parsed = JSON.parse(jsonMatch[0])

  return {
    affectedFiles: Array.isArray(parsed.affectedFiles) ? parsed.affectedFiles : [],
    locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    callChain: parsed.callChain || '',
    entryPoint: parsed.entryPoint || '',
  }
}
