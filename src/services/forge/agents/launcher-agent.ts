import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import { SkillLoader } from '@/src/services/skill-loader'
import type { ProjectType } from '@/src/types/dag'

export interface LaunchAssessment {
  projectType: string
  framework: string | null
  installCommand: string | null
  startCommand: string | null
  expectedPort: number | null
  ready: boolean
  blockers: string[]
  missingPackages: string[]
  summary: string
}

const FALLBACK_PROMPT = `You are the Forge Launcher Agent.

Your job is to evaluate whether a generated project is actually launch-ready at the END of the pipeline.

You receive:
1. The project files (paths and full contents)
2. The inferred project type
3. The repo conventions

You must determine:
1. What kind of project this is (React/Vite, Next.js, Express, Python, Go, static, Godot, Unity, Unreal, etc.)
2. Which install command should be used
3. Which start/dev command should be used
4. Which port the app is expected to serve on
5. Whether the app is ready to start right now
6. What concrete blockers still prevent startup
7. Which packages or config items appear to be missing or incompatible

Be strict. If package versions are obviously incompatible, the app is NOT ready.
If Vite React config exists but @vitejs/plugin-react is missing or incompatible, the app is NOT ready.
If React and react-dom major versions are mismatched, the app is NOT ready.
If testing dependencies force an incompatible React range, the app is NOT ready.
If the project is a Godot, Unity, or Unreal project, do NOT treat it as a normal npm app.
For engine projects, mark it ready only when the engine-specific project structure is present and make it clear that launch requires an engine-capable worker/runtime.

Return ONLY valid JSON:
{
  "projectType": "node",
  "framework": "vite-react",
  "installCommand": "npm install",
  "startCommand": "npm run dev",
  "expectedPort": 5173,
  "ready": false,
  "blockers": [
    "react is pinned to 17.x but react-dom is 18.x",
    "@vitejs/plugin-react is missing from devDependencies"
  ],
  "missingPackages": ["@vitejs/plugin-react"],
  "summary": "Launch blocked by incompatible frontend dependency versions"
}`

export async function evaluateLaunchReadiness(opts: {
  userId: string
  files: Array<{ filePath: string; content: string }>
  projectType: ProjectType
  conventions?: Record<string, unknown>
}): Promise<LaunchAssessment> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-launcher')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(opts.userId)
  const userMessage = [
    '## Inferred Project Type',
    opts.projectType,
    '\n## Repo Conventions',
    JSON.stringify(opts.conventions ?? {}, null, 2),
    '\n## Files',
    JSON.stringify(opts.files, null, 2),
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
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Launcher agent returned no JSON')
  }

  const parsed = JSON.parse(jsonMatch[0])
  return {
    projectType: parsed.projectType || opts.projectType,
    framework: parsed.framework || null,
    installCommand: parsed.installCommand || null,
    startCommand: parsed.startCommand || null,
    expectedPort: typeof parsed.expectedPort === 'number' ? parsed.expectedPort : null,
    ready: Boolean(parsed.ready),
    blockers: Array.isArray(parsed.blockers) ? parsed.blockers.map(String) : [],
    missingPackages: Array.isArray(parsed.missingPackages) ? parsed.missingPackages.map(String) : [],
    summary: parsed.summary || '',
  }
}
