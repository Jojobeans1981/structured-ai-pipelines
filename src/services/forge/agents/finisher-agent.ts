import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import { SkillLoader } from '@/src/services/skill-loader'
import type { LaunchAssessment } from './launcher-agent'

export interface FinisherResult {
  summary: string
  fixes: Array<{ file: string; description: string; content: string }>
}

const FALLBACK_PROMPT = `You are the Forge Finisher Agent.

You are called ONLY after the launcher agent decides a project is not ready to start.

Your job:
1. Read the launcher assessment and startup blockers
2. Read the project files
3. Produce the MINIMUM set of file edits required to make the project runnable
4. Return complete file contents for every file you change

Focus especially on:
- package.json dependency alignment
- start/dev/build script correctness
- vite.config / next.config correctness
- missing entry points
- missing runtime packages imported by config files
- incompatible React / react-dom / Vite / plugin versions

Rules:
- Return only files that should actually be created or modified
- Output complete file contents, not diffs
- Prefer fixing package manifests and config over broad rewrites
- Do not add placeholder comments

Return ONLY valid JSON:
{
  "summary": "Aligned React/Vite dependencies and fixed startup scripts",
  "fixes": [
    {
      "file": "package.json",
      "description": "Align React/Vite/tooling versions and fix scripts",
      "content": "{ ... full package.json ... }"
    }
  ]
}`

export async function finishLaunchReadiness(opts: {
  userId: string
  files: Array<{ filePath: string; content: string }>
  assessment: LaunchAssessment
}): Promise<FinisherResult> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-finisher')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(opts.userId)
  const userMessage = [
    '## Launcher Assessment',
    JSON.stringify(opts.assessment, null, 2),
    '\n## Project Files',
    JSON.stringify(opts.files, null, 2),
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
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Finisher agent returned no JSON')
  }

  const parsed = JSON.parse(jsonMatch[0])

  return {
    summary: parsed.summary || '',
    fixes: Array.isArray(parsed.fixes)
      ? parsed.fixes.map((fix: Record<string, string>) => ({
          file: fix.file || '',
          description: fix.description || '',
          content: fix.content || '',
        })).filter((fix: { file: string; content: string }) => fix.file && fix.content)
      : [],
  }
}
