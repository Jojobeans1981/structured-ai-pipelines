import { CompletenessPass, detectProjectType } from '@/src/services/completeness-pass'
import { evaluateUsability } from '@/src/services/forge/agents/usability-agent'
import type { LaunchAssessment } from '@/src/services/forge/agents/launcher-agent'
import type { ProjectType } from '@/src/types/dag'
import { posix as pathPosix } from 'path'

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

function looksLikeJsx(content: string): boolean {
  return /return\s*\(\s*</.test(content)
    || /<([A-Z][A-Za-z0-9]*|div|span|main|section|article|header|footer|button|form|input|label|ul|li|p|h1|h2|h3)\b/.test(content)
}

function replaceImportSpecifier(content: string, fromPath: string, toPath: string): string {
  return content
    .replaceAll(`'${fromPath}'`, `'${toPath}'`)
    .replaceAll(`"${fromPath}"`, `"${toPath}"`)
}

function findPreferredAppEntry(files: PreviewFile[]): string | null {
  const priorityPatterns = [
    /^src\/App\.(tsx|jsx|ts|js)$/,
    /^src\/app\.(tsx|jsx|ts|js)$/,
    /^src\/components\/App\.(tsx|jsx|ts|js)$/,
    /^src\/pages\/App\.(tsx|jsx|ts|js)$/,
  ]

  for (const pattern of priorityPatterns) {
    const match = files.find((file) => pattern.test(file.filePath))
    if (match) {
      return match.filePath
    }
  }

  const fallback = files.find((file) =>
    file.filePath.startsWith('src/')
    && /\.(tsx|jsx|ts|js)$/.test(file.filePath)
    && !/(^|\/)(main|index)\.(tsx|jsx|ts|js)$/.test(file.filePath)
    && /export\s+default/.test(file.content)
  )

  return fallback?.filePath || null
}

function repairMainEntryImports(files: PreviewFile[]): { files: PreviewFile[]; warnings: string[] } {
  const preferredAppEntry = findPreferredAppEntry(files)
  if (!preferredAppEntry) {
    return { files, warnings: [] }
  }

  const existingPaths = new Set(files.map((file) => file.filePath))
  const entryFiles = new Set([
    'src/main.tsx',
    'src/main.ts',
    'src/main.jsx',
    'src/main.js',
    'src/index.tsx',
    'src/index.ts',
    'src/index.jsx',
    'src/index.js',
  ])

  const repairedEntries: string[] = []
  const nextFiles = files.map((file) => {
    if (!entryFiles.has(file.filePath)) return file
    if (!/import\s+App\s+from\s+['"][^'"]+['"]/.test(file.content)) return file

    const currentImportMatch = file.content.match(/import\s+App\s+from\s+['"]([^'"]+)['"]/)
    if (!currentImportMatch) return file

    const currentSpecifier = currentImportMatch[1]
    const baseDir = pathPosix.dirname(file.filePath)
    const normalizedCurrentPath = currentSpecifier.startsWith('.')
      ? pathPosix.normalize(pathPosix.join(baseDir, currentSpecifier))
      : currentSpecifier

    const currentCandidates = [
      normalizedCurrentPath,
      `${normalizedCurrentPath}.ts`,
      `${normalizedCurrentPath}.tsx`,
      `${normalizedCurrentPath}.js`,
      `${normalizedCurrentPath}.jsx`,
      pathPosix.join(normalizedCurrentPath, 'index.tsx'),
      pathPosix.join(normalizedCurrentPath, 'index.jsx'),
      pathPosix.join(normalizedCurrentPath, 'index.ts'),
      pathPosix.join(normalizedCurrentPath, 'index.js'),
    ]

    if (currentCandidates.some((candidate) => existingPaths.has(candidate))) {
      return file
    }

    const relativeTarget = pathPosix.relative(baseDir, preferredAppEntry)
    const nextSpecifier = (relativeTarget.startsWith('.') ? relativeTarget : `./${relativeTarget}`)
      .replace(/\.(tsx|jsx|ts|js)$/, '')

    if (nextSpecifier === currentSpecifier) {
      return file
    }

    repairedEntries.push(`${file.filePath} -> ${nextSpecifier}`)
    return {
      ...file,
      content: replaceImportSpecifier(file.content, currentSpecifier, nextSpecifier),
    }
  })

  if (repairedEntries.length === 0) {
    return { files, warnings: [] }
  }

  return {
    files: nextFiles,
    warnings: [`Preview repaired main entry imports: ${repairedEntries.join(', ')}`],
  }
}

function repairJsxExtensions(files: PreviewFile[]): { files: PreviewFile[]; warnings: string[] } {
  const renameMap = new Map<string, string>()

  for (const file of files) {
    if (!file.filePath.endsWith('.js')) continue
    if (!looksLikeJsx(file.content)) continue
    renameMap.set(file.filePath, file.filePath.replace(/\.js$/, '.jsx'))
  }

  if (renameMap.size === 0) {
    return { files, warnings: [] }
  }

  const repairedFiles = files.map((file) => {
    let nextPath = renameMap.get(file.filePath) || file.filePath
    let nextContent = file.content

    for (const [fromPath, toPath] of renameMap.entries()) {
      const relativeFrom = pathPosix.relative(pathPosix.dirname(file.filePath), fromPath)
      const relativeTo = pathPosix.relative(pathPosix.dirname(nextPath), toPath)
      const normalizedFrom = relativeFrom.startsWith('.') ? relativeFrom : `./${relativeFrom}`
      const normalizedTo = relativeTo.startsWith('.') ? relativeTo : `./${relativeTo}`
      const fromWithoutExt = normalizedFrom.replace(/\.js$/, '')
      const toWithoutExt = normalizedTo.replace(/\.jsx$/, '')

      nextContent = replaceImportSpecifier(nextContent, fromPath, toPath)
      nextContent = replaceImportSpecifier(nextContent, normalizedFrom, normalizedTo)
      nextContent = replaceImportSpecifier(nextContent, fromWithoutExt, toWithoutExt)
    }

    return { filePath: nextPath, content: nextContent }
  })

  return {
    files: repairedFiles,
    warnings: [`Preview renamed JSX-in-.js files: ${Array.from(renameMap.entries()).map(([fromPath, toPath]) => `${fromPath} -> ${toPath}`).join(', ')}`],
  }
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
  const jsxRepair = repairJsxExtensions(files)
  const importRepair = repairMainEntryImports(jsxRepair.files)
  const projectType = detectPreviewProjectType(importRepair.files)
  const completeness = CompletenessPass.run(importRepair.files, projectType)
  const mergedFiles = new Map(importRepair.files.map((file) => [file.filePath, file.content]))
  const changedPaths: string[] = []

  for (const file of completeness.files) {
    const previous = mergedFiles.get(file.filePath)
    if (previous !== file.content) {
      changedPaths.push(file.filePath)
      mergedFiles.set(file.filePath, file.content)
    }
  }

  const warnings = [
    ...jsxRepair.warnings,
    ...importRepair.warnings,
    ...(changedPaths.length > 0
      ? [`Preview auto-scaffolded or repaired ${changedPaths.length} file(s): ${changedPaths.join(', ')}`]
      : []),
  ]

  return {
    projectType,
    files: Array.from(mergedFiles.entries()).map(([filePath, content]) => ({ filePath, content })),
    warnings,
  }
}
