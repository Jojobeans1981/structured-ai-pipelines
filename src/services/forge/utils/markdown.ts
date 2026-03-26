import matter from 'gray-matter'
import { marked } from 'marked'

export function extractMarkdownText(raw: string): string {
  const { content } = matter(raw)
  const html = marked(content) as string
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) throw new Error('Markdown produced no extractable text')
  return text
}

export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.md')) {
    return extractMarkdownText(buffer.toString('utf-8'))
  }
  if (lower.endsWith('.txt')) {
    const text = buffer.toString('utf-8').trim()
    if (!text) throw new Error('Text file is empty')
    return text
  }
  if (lower.endsWith('.pdf')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      const text = (data.text || '').trim()
      if (!text) throw new Error('PDF contains no extractable text')
      return text
    } catch (err) {
      if (err instanceof Error && err.message.includes('no extractable')) throw err
      throw new Error('Failed to parse PDF file')
    }
  }
  throw new Error('Unsupported file type. Use .md, .txt, or .pdf')
}
