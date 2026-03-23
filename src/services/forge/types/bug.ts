export interface BugReport {
  description: string
  errorLogs: string
  symptoms: string
}

export interface CodeLocation {
  file: string
  lines: string
  relevance: string
  snippet: string
}

export interface CodeMap {
  affectedFiles: string[]
  locations: CodeLocation[]
  callChain: string
  entryPoint: string
}
