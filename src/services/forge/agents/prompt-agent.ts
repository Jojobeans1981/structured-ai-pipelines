import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import type { ImplementationManifest } from '../types/manifest'
import type { ConventionsProfile } from '../types/conventions'
import { SkillLoader } from '@/src/services/skill-loader'

const FALLBACK_PROMPT = `You are an implementation planner. Given a PRD and repo conventions, generate an ordered file manifest for implementation.

Rules:
1. List files in infrastructure-first order: configs → types/interfaces → data layer → services/business logic → API routes → UI components
2. Each file must specify: path, description, and dependencies (array of other file paths from this manifest that it imports from)
3. No file may depend on a file that comes AFTER it in the list (topological ordering)
4. Include ALL files needed: configs, types, data models, services, routes, components, tests
5. Match the repo's directory structure and naming conventions
6. If the project is a Godot, Unity, or Unreal project, plan the real engine project layout instead of a generic Node/Vite app
7. Never put engine runtime names like godot, unity, or unreal into package.json dependencies

Return ONLY valid JSON matching this shape:
{
  "files": [
    { "path": "src/types/foo.ts", "description": "Type definitions for...", "dependencies": [] },
    { "path": "src/services/foo.ts", "description": "Service that...", "dependencies": ["src/types/foo.ts"] }
  ]
}

No markdown fences, no explanation. Just the JSON object.`

export async function generateManifest(opts: {
  userId: string
  prdFullText: string
  conventions: ConventionsProfile
}): Promise<ImplementationManifest> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-prompt')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(opts.userId)

  const userMessage = [
    '## PRD\n',
    opts.prdFullText,
    '\n\n## Repo Conventions\n',
    JSON.stringify(opts.conventions, null, 2),
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
  if (!jsonMatch) throw new Error('Prompt agent returned no JSON')

  const parsed = JSON.parse(jsonMatch[0])

  // Validate basic shape
  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error('Prompt agent returned invalid manifest: missing files array')
  }

  for (const file of parsed.files) {
    if (!file.path || !file.description) {
      throw new Error(`Invalid manifest entry: ${JSON.stringify(file)}`)
    }
    if (!Array.isArray(file.dependencies)) {
      file.dependencies = []
    }
  }

  return parsed as ImplementationManifest
}
