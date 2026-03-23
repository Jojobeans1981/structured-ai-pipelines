import matter from 'gray-matter'
import { marked } from 'marked'

export function extractMarkdownText(raw: string): string {
  const { content } = matter(raw)
  const html = marked(content) as string
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) throw new Error('Markdown produced no extractable text')
  return text
}

export function extractTextFromFile(buffer: Buffer, filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.md')) {
    return extractMarkdownText(buffer.toString('utf-8'))
  }
  if (lower.endsWith('.txt')) {
    const text = buffer.toString('utf-8').trim()
    if (!text) throw new Error('Text file is empty')
    return text
  }
  throw new Error('Unsupported file type. Use .md or .txt')
}
