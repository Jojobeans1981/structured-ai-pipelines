import type { ProjectType } from '@/src/types/dag'
import type { LaunchAssessment } from './launcher-agent'

interface RepoFile {
  filePath: string
  content: string
}

export interface UsabilityAssessment {
  usable: boolean
  summary: string
  blockers: string[]
  warnings: string[]
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function hasFile(files: RepoFile[], expectedPath: string): boolean {
  const normalized = normalizePath(expectedPath)
  return files.some((file) => normalizePath(file.filePath) === normalized)
}

function hasAnyFile(files: RepoFile[], expectedPaths: string[]): boolean {
  return expectedPaths.some((expectedPath) => hasFile(files, expectedPath))
}

function findPackageJson(files: RepoFile[]): null | {
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
} {
  const packageJson = files.find((file) => normalizePath(file.filePath) === 'package.json')
  if (!packageJson) return null

  try {
    const parsed = JSON.parse(packageJson.content) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    return {
      scripts: parsed.scripts ?? {},
      dependencies: parsed.dependencies ?? {},
      devDependencies: parsed.devDependencies ?? {},
    }
  } catch {
    return null
  }
}

function detectNodeAppShape(
  files: RepoFile[],
  launchAssessment: LaunchAssessment,
): 'next' | 'vite-react' | 'server' | 'generic' {
  const framework = (launchAssessment.framework || '').toLowerCase()
  if (framework.includes('next')) {
    return 'next'
  }

  if (framework.includes('vite') || framework.includes('react')) {
    return 'vite-react'
  }

  if (hasAnyFile(files, ['next.config.js', 'next.config.mjs', 'next.config.ts', 'app/page.tsx', 'pages/index.tsx', 'pages/index.jsx'])) {
    return 'next'
  }

  const hasViteConfig = hasAnyFile(files, ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'])
  const hasReactEntry = hasAnyFile(files, ['src/main.tsx', 'src/main.jsx', 'src/App.tsx', 'src/App.jsx'])
  if (hasViteConfig || hasReactEntry) {
    return 'vite-react'
  }

  if (hasAnyFile(files, ['src/index.ts', 'src/index.js', 'src/server.ts', 'src/server.js', 'server.js', 'index.js'])) {
    return 'server'
  }

  return 'generic'
}

function getMissingDependencies(pkg: NonNullable<ReturnType<typeof findPackageJson>>, names: string[]): string[] {
  return names.filter((name) => !(name in pkg.dependencies) && !(name in pkg.devDependencies))
}

export function evaluateUsability(opts: {
  files: RepoFile[]
  projectType: ProjectType
  launchAssessment: LaunchAssessment
}): UsabilityAssessment {
  const blockers: string[] = []
  const warnings: string[] = []

  if (opts.projectType === 'unknown') {
    blockers.push('Forge could not determine the project type, so usability cannot be proven')
  }

  if (opts.projectType === 'static') {
    if (!hasFile(opts.files, 'index.html')) {
      blockers.push('Static project is missing index.html')
    }
  }

  if (opts.projectType === 'node') {
    const pkg = findPackageJson(opts.files)
    if (!pkg) {
      blockers.push('Node project is missing a readable package.json')
    } else {
      const hasStartScript = Boolean(pkg.scripts.dev || pkg.scripts.start)
      if (!hasStartScript) {
        blockers.push('package.json is missing a dev or start script')
      }

      if (!opts.launchAssessment.startCommand) {
        blockers.push('Launcher could not identify a startup command for the Node project')
      }

      const shape = detectNodeAppShape(opts.files, opts.launchAssessment)

      if (shape === 'vite-react') {
        if (!hasFile(opts.files, 'index.html')) {
          blockers.push('Vite/React project is missing index.html')
        }
        if (!hasAnyFile(opts.files, ['src/main.tsx', 'src/main.jsx'])) {
          blockers.push('Vite/React project is missing a main client entrypoint')
        }

        const missing = getMissingDependencies(pkg, ['react', 'react-dom', 'vite'])
        for (const dep of missing) {
          blockers.push(`Vite/React project is missing required dependency "${dep}"`)
        }

        if (hasAnyFile(opts.files, ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'])) {
          const pluginMissing = getMissingDependencies(pkg, ['@vitejs/plugin-react'])
          for (const dep of pluginMissing) {
            blockers.push(`Vite config exists but required dependency "${dep}" is missing`)
          }
        }
      }

      if (shape === 'next') {
        const missing = getMissingDependencies(pkg, ['next', 'react', 'react-dom'])
        for (const dep of missing) {
          blockers.push(`Next.js project is missing required dependency "${dep}"`)
        }

        if (!hasAnyFile(opts.files, ['app/page.tsx', 'app/page.jsx', 'pages/index.tsx', 'pages/index.jsx'])) {
          blockers.push('Next.js project is missing a root page entry')
        }
      }

      if (shape === 'server') {
        if (!hasAnyFile(opts.files, ['src/index.ts', 'src/index.js', 'src/server.ts', 'src/server.js', 'server.js', 'index.js'])) {
          blockers.push('Server project is missing a recognizable server entry file')
        }
      }

      if (hasAnyFile(opts.files, ['src/index.ts', 'src/main.tsx', 'src/main.ts', 'src/server.ts']) && !hasFile(opts.files, 'tsconfig.json')) {
        warnings.push('TypeScript source exists without tsconfig.json; startup may still be fragile')
      }
    }
  }

  if (opts.projectType === 'godot' && !hasFile(opts.files, 'project.godot')) {
    blockers.push('Godot project is missing project.godot')
  }

  if (opts.projectType === 'unity' && !hasAnyFile(opts.files, ['Assets', 'ProjectSettings/ProjectVersion.txt'])) {
    blockers.push('Unity project is missing expected engine project structure')
  }

  if (opts.projectType === 'unreal' && !hasAnyFile(opts.files, ['Config/DefaultEngine.ini', 'Content'])) {
    warnings.push('Unreal project could not be fully confirmed from the generated structure alone')
  }

  const uniqueBlockers = Array.from(new Set(blockers))
  const uniqueWarnings = Array.from(new Set(warnings))

  return {
    usable: uniqueBlockers.length === 0,
    summary: uniqueBlockers[0] || 'Project satisfies deterministic usability checks',
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
  }
}
