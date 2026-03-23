import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import type { ScaffoldedFile } from '../types/scaffold'
import { SkillLoader } from '@/src/services/skill-loader'

export interface ValidationResult {
  passed: boolean
  issues: Array<{ phase: string; description: string }>
  fixes: Array<{ file: string; description: string; content: string }>
}

const FALLBACK_PROMPT = `You are a code validator. Run a 6-phase validation on the provided files and return results as JSON.

## Validation Phases

Phase 1 — Structure: Check that manifests (package.json, etc.), entry points, and config files exist and are correctly structured.
Phase 2 — Import Resolution: Verify all imports resolve to files that exist in the provided set.
Phase 3 — Dependency Manifest: Check that package.json/requirements.txt includes ALL packages imported in the code.
Phase 4 — Environment Variables: Verify env vars are documented (in .env.example or comments), no hardcoded secrets.
Phase 5 — Entry Point Wiring: Verify entry points (index.ts, app.ts, main.ts) import and use the generated services/components.
Phase 6 — Database Validation: Check migrations, seed data, and connection config are consistent.

## Output

Return ONLY valid JSON:
{
  "passed": true/false,
  "issues": [
    { "phase": "Import Resolution", "description": "src/routes/api.ts imports from './services/auth' but no such file exists" }
  ],
  "fixes": [
    { "file": "src/services/auth.ts", "description": "Created missing auth service", "content": "full file content here" }
  ]
}

If all checks pass, return { "passed": true, "issues": [], "fixes": [] }.
If issues are found, provide fixes with COMPLETE corrected file contents — not diffs.
No markdown fences, no explanation. Just JSON.`

export async function validateFiles(
  userId: string,
  files: ScaffoldedFile[],
): Promise<ValidationResult> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-validator')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(userId)

  const filesJson = JSON.stringify(
    files.map(f => ({ path: f.path, content: f.content })),
    null,
    2,
  )

  const response = await callWithRetry(() =>
    createWithFallback(client, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: `## Files to Validate\n\n${filesJson}` }],
    })
  )

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Validator agent returned no JSON')

  const parsed = JSON.parse(jsonMatch[0])

  return {
    passed: Boolean(parsed.passed),
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    fixes: Array.isArray(parsed.fixes) ? parsed.fixes : [],
  }
}
