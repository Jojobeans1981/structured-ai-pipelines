import { getAnthropicClient, createWithFallback, callWithRetry } from '@/src/lib/anthropic'
import type { PRDOutput } from '../types/prd'
import type { ConventionsProfile } from '../types/conventions'
import { SkillLoader } from '@/src/services/skill-loader'

const FALLBACK_PROMPT = `You are a senior technical architect. Generate a comprehensive Product Requirements Document (PRD) for the described feature.

The PRD must include:
- Title (first line, as a markdown heading)
- Summary (concise 2-3 sentence overview)
- User stories with priority (P0/P1/P2)
- Technical approach that matches the repo's existing conventions
- API routes (if applicable) with method, path, request/response shapes
- Data model changes (new tables/fields)
- Environment variable requirements
- Error handling approach
- File manifest (what files to create/modify with descriptions)
- Integration points with existing code
- Build and run instructions

Match the repo's language, framework, and coding conventions. If this is a greenfield repo, design from scratch using best practices for the detected stack.

Write the PRD as clean markdown. Be thorough but practical.`

export async function generatePRD(opts: {
  userId: string
  specContent: string
  conventions: ConventionsProfile
  greenfield: boolean
  lessonsContext: string
}): Promise<PRDOutput> {
  let systemPrompt: string
  try {
    systemPrompt = await SkillLoader.getSkillPromptAsync('forge-prd')
  } catch {
    systemPrompt = FALLBACK_PROMPT
  }

  const client = await getAnthropicClient(opts.userId)

  const userMessage = [
    '## Feature Spec\n',
    opts.specContent,
    '\n\n## Repo Conventions\n',
    JSON.stringify(opts.conventions, null, 2),
    `\n\nGreenfield repo: ${opts.greenfield}`,
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

  const fullText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  // Extract title from first heading
  const titleMatch = fullText.match(/^#\s+(.+)/m)
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Feature'

  // Extract summary — first paragraph after the title
  const lines = fullText.split('\n')
  let summary = ''
  let foundTitle = false
  for (const line of lines) {
    if (!foundTitle && line.startsWith('#')) {
      foundTitle = true
      continue
    }
    if (foundTitle && line.trim() && !line.startsWith('#')) {
      summary = line.trim()
      break
    }
  }

  return { title, summary, fullText }
}
