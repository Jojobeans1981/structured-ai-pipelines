import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import type { ManifestFile } from '../types/manifest'
import type { ConventionsProfile } from '../types/conventions'
import { SkillLoader } from '@/src/services/skill-loader'

const FALLBACK_PROMPT = `You are a production code generator. Generate the complete, production-ready source code for a single file.

Rules:
1. Output ONLY the file content — no markdown fences, no explanations, no file path comments at the top
2. Match the repo's coding conventions exactly (naming, style, patterns)
3. All imports must resolve to real files (dependencies are provided below)
4. No hardcoded secrets, API keys, or tokens — use environment variables
5. Proper error handling with typed errors
6. Full type safety — no \`any\` types unless absolutely necessary
7. If this file is an entry point (e.g., index.ts, app.ts, main.ts), it MUST import and wire up the services/components from the manifest

Generate the complete file content. Every function must be fully implemented — no TODOs, no stubs, no placeholder comments.`

export async function scaffoldFile(opts: {
  userId: string
  file: ManifestFile
  conventions: ConventionsProfile
  dependencyContents: Record<string, string>
  fullManifest: ManifestFile[]
  lessonsContext: string
}): Promise<string> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-scaffolder')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(opts.userId)

  const depSection = Object.entries(opts.dependencyContents)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n')

  const manifestSummary = opts.fullManifest
    .map(f => `- ${f.path}: ${f.description}`)
    .join('\n')

  const userMessage = [
    `## File to Generate\n`,
    `Path: ${opts.file.path}`,
    `Description: ${opts.file.description}`,
    `Dependencies: ${opts.file.dependencies.join(', ') || 'none'}`,
    `\n\n## Repo Conventions\n`,
    JSON.stringify(opts.conventions, null, 2),
    `\n\n## Full Manifest (for context)\n`,
    manifestSummary,
    depSection ? `\n\n## Dependency File Contents\n\n${depSection}` : '',
    opts.lessonsContext || '',
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
  return fenceMatch ? fenceMatch[1].trim() : text.trim()
}
