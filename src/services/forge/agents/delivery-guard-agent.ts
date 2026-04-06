import { preparePreviewFiles, runPreviewPreflight } from '@/src/services/preview-preflight'
import type { ProjectType } from '@/src/types/dag'

interface RepoFile {
  filePath: string
  content: string
}

export interface DeliveryGuardResult {
  projectType: ProjectType
  ready: boolean
  summary: string
  blockers: string[]
  warnings: string[]
  fixes: Array<{ filePath: string; content: string }>
}

function findPackageJson(files: RepoFile[]): null | {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
} {
  const packageJson = files.find((file) => file.filePath === 'package.json')
  if (!packageJson) return null

  try {
    const parsed = JSON.parse(packageJson.content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    return {
      dependencies: parsed.dependencies ?? {},
      devDependencies: parsed.devDependencies ?? {},
    }
  } catch {
    return null
  }
}

function detectRouterBlockers(files: RepoFile[]): string[] {
  const pkg = findPackageJson(files)
  if (!pkg) return []

  const routerVersion = pkg.dependencies['react-router-dom'] || pkg.devDependencies['react-router-dom'] || ''
  if (!routerVersion) return []

  const likelyV6 = /(^|[^\d])6\b|^\^6|^~6|^>=6/.test(routerVersion)
  if (!likelyV6) return []

  const blockers: string[] = []
  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/.test(file.filePath)) continue
    if (/\bSwitch\b/.test(file.content)) {
      blockers.push(`${file.filePath} uses react-router Switch even though react-router-dom is version 6`)
    }
    if (/\bcomponent\s*=/.test(file.content)) {
      blockers.push(`${file.filePath} uses Route component= syntax that is incompatible with react-router-dom v6`)
    }
    if (/\b<Route[^>]*\sexact\b/.test(file.content)) {
      blockers.push(`${file.filePath} uses Route exact syntax from older react-router APIs`)
    }
  }

  return blockers
}

export function runDeliveryGuard(files: RepoFile[]): DeliveryGuardResult {
  const prepared = preparePreviewFiles(files)
  const preflight = runPreviewPreflight(prepared.files)
  const additionalBlockers = detectRouterBlockers(prepared.files)
  const blockers = Array.from(new Set([...preflight.blockers, ...additionalBlockers]))
  const fixes = prepared.files.filter((file) => {
    const original = files.find((entry) => entry.filePath === file.filePath)
    return !original || original.content !== file.content
  })

  const summary = blockers[0]
    || prepared.warnings[0]
    || 'Delivery guard found no preview/runtime blockers'

  return {
    projectType: prepared.projectType,
    ready: blockers.length === 0,
    summary,
    blockers,
    warnings: prepared.warnings,
    fixes,
  }
}
