import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import { ConventionsProfileSchema } from '../types/conventions'
import type { ConventionsProfile } from '../types/conventions'
import { SkillLoader } from '@/src/services/skill-loader'

const FALLBACK_PROMPT = `You are a code convention analyzer. Your job is to analyze a repository's structure and code samples to detect its conventions and patterns.

Analyze the provided directory tree and code samples. Return a JSON object with these exact fields:
- language: primary programming language (e.g., "TypeScript", "Python", "Go")
- additionalLanguages: array of other languages used
- framework: main framework (e.g., "Next.js", "Express", "Django") or null
- packageManager: package manager used (e.g., "npm", "yarn", "pnpm", "pip") or null
- testRunner: test framework (e.g., "vitest", "jest", "pytest") or null
- lintCommand: lint command (e.g., "npm run lint") or null
- testCommand: test command (e.g., "npm test") or null
- buildCommand: build command (e.g., "npm run build") or null
- ciConfig: CI config file name (e.g., ".github/workflows/ci.yml") or null
- directoryStructure: description of directory organization pattern
- namingConventions: { files: file naming pattern, functions: function naming pattern }
- codeStyleSamples: array of 2-3 representative code style snippets (short, showing patterns)
- lintConfig: lint config file name or null

Return ONLY valid JSON. No markdown fences, no explanation.`

export async function analyzeRepo(
  userId: string,
  tree: string,
  codeSamples: string[],
): Promise<ConventionsProfile> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-analyzer')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(userId)

  const userMessage = `## Directory Tree\n\n${tree}\n\n## Code Samples\n\n${codeSamples.join('\n\n---\n\n')}`

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

  // Extract JSON from response (may be wrapped in code fence)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Analyzer agent returned no JSON')

  const parsed = JSON.parse(jsonMatch[0])
  return ConventionsProfileSchema.parse(parsed)
}
