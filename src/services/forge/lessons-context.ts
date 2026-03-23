import { getForgeLessonsForContext } from './db'

export async function buildForgeLessonsSection(
  language?: string,
  framework?: string,
): Promise<string> {
  const lessons = await getForgeLessonsForContext(language, framework)

  if (lessons.length === 0) return ''

  const entries = lessons.map((l, i) =>
    `${i + 1}. Phase: ${l.phaseName} | Error: ${l.error}\n   Prevention: ${l.preventionRule}`
  )

  return `\n## LESSONS FROM PAST RUNS — DO NOT REPEAT THESE MISTAKES\n\n${entries.join('\n\n')}\n`
}
