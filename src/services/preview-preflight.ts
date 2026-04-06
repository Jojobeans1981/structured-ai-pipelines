import { CompletenessPass, detectProjectType } from '@/src/services/completeness-pass'
import { evaluateUsability } from '@/src/services/forge/agents/usability-agent'
import type { LaunchAssessment } from '@/src/services/forge/agents/launcher-agent'
import type { ProjectType } from '@/src/types/dag'

interface PreviewFile {
  filePath: string
  content: string
}

export interface PreviewPreflightResult {
  ok: boolean
  projectType: ProjectType
  blockers: string[]
  warnings: string[]
}

export interface PreparedPreviewFilesResult {
  projectType: ProjectType
  files: PreviewFile[]
  warnings: string[]
}

function detectPreviewProjectType(files: PreviewFile[]): ProjectType {
  const inferred = detectProjectType(files.map((file) => ({ filePath: file.filePath })))
  if (inferred === 'static' && files.some((file) => /\.(tsx?|jsx?)$/.test(file.filePath))) {
    return 'node'
  }
  return inferred
}

function inferLaunchAssessment(files: PreviewFile[], projectType: ProjectType): LaunchAssessment {
  const packageJson = files.find((file) => file.filePath === 'package.json')
  let scripts: Record<string, string> = {}

  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson.content) as { scripts?: Record<string, string> }
      scripts = parsed.scripts ?? {}
    } catch {
      scripts = {}
    }
  }

  const hasViteConfig = files.some((file) => /^vite\.config\.(ts|js|mjs)$/.test(file.filePath))
  const hasNextConfig = files.some((file) => /^next\.config\.(ts|js|mjs)$/.test(file.filePath))
  const hasReactEntry = files.some((file) => /(^|\/)(main|App)\.(tsx|jsx)$/.test(file.filePath))
  const framework = projectType !== 'node'
    ? projectType
    : hasNextConfig
      ? 'next'
      : hasViteConfig || hasReactEntry
        ? 'vite-react'
        : 'node'

  const startCommand = scripts.dev || scripts.start || null
  const expectedPort = framework === 'vite-react'
    ? 5173
    : framework === 'next'
      ? 3000
      : projectType === 'static'
        ? 4173
        : 3000

  return {
    projectType,
    framework,
    installCommand: projectType === 'node' ? 'npm install' : null,
    startCommand,
    expectedPort,
    ready: Boolean(startCommand) || projectType === 'static' || projectType === 'godot' || projectType === 'unity' || projectType === 'unreal',
    blockers: startCommand ? [] : ['No startup command could be inferred from the stored project files'],
    missingPackages: [],
    summary: startCommand
      ? 'Launch command inferred from stored project files'
      : 'Preview launch blocked because no startup command could be inferred',
  }
}

export function runPreviewPreflight(files: PreviewFile[]): PreviewPreflightResult {
  const projectType = detectPreviewProjectType(files)
  const launchAssessment = inferLaunchAssessment(files, projectType)
  const usability = evaluateUsability({
    files,
    projectType,
    launchAssessment,
  })

  return {
    ok: usability.usable,
    projectType,
    blockers: usability.blockers,
    warnings: usability.warnings,
  }
}

export function preparePreviewFiles(files: PreviewFile[]): PreparedPreviewFilesResult {
  const projectType = detectPreviewProjectType(files)
  const completeness = CompletenessPass.run(files, projectType)
  const mergedFiles = new Map(files.map((file) => [file.filePath, file.content]))
  const changedPaths: string[] = []

  for (const file of completeness.files) {
    const previous = mergedFiles.get(file.filePath)
    if (previous !== file.content) {
      changedPaths.push(file.filePath)
      mergedFiles.set(file.filePath, file.content)
    }
  }

  const warnings = changedPaths.length > 0
    ? [`Preview auto-scaffolded or repaired ${changedPaths.length} file(s): ${changedPaths.join(', ')}`]
    : []

  return {
    projectType,
    files: Array.from(mergedFiles.entries()).map(([filePath, content]) => ({ filePath, content })),
    warnings,
  }
}
