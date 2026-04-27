import simpleGit from 'simple-git'
import { readdirSync, statSync, readFileSync, existsSync } from 'fs'
import { extname, isAbsolute, join, relative, resolve } from 'path'

const IGNORED_DIRS = ['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'venv']

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb',
  '.cs', '.cpp', '.c', '.h', '.swift', '.kt', '.scala', '.php',
])

export function validateGitLabRepoUrl(repoUrl: string): string {
  let url: URL
  try {
    url = new URL(repoUrl)
  } catch {
    throw new Error('GitLab repo URL must be a valid HTTPS URL')
  }

  const hostname = url.hostname.toLowerCase()
  const configuredHosts = (process.env.GITLAB_ALLOWED_HOSTS ?? process.env.GITLAB_HOST ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  const allowedHosts = configuredHosts.length > 0
    ? configuredHosts
    : ['gitlab.com', 'labs.gauntletai.com']
  const isPrivateIpv4 =
    /^10\./.test(hostname) ||
    /^127\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !allowedHosts.includes(hostname) ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    isPrivateIpv4
  ) {
    throw new Error(`GitLab repo URL must use HTTPS and one of: ${allowedHosts.join(', ')}`)
  }

  const pathParts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean)
  if (pathParts.length < 2) {
    throw new Error('GitLab repo URL must include a group and project path')
  }

  url.hash = ''
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

export async function cloneRepo(repoUrl: string, targetDir: string): Promise<void> {
  console.log(`[Repo] Cloning ${repoUrl} to ${targetDir}`)
  await simpleGit().clone(repoUrl, targetDir, ['--depth', '1'])
  console.log(`[Repo] Clone complete`)
}

export function safeRepoPath(workDir: string, repoRelativePath: string): string {
  if (!repoRelativePath || isAbsolute(repoRelativePath) || repoRelativePath.startsWith('/')) {
    throw new Error(`Unsafe repo path: ${repoRelativePath}`)
  }

  const root = resolve(workDir)
  const fullPath = resolve(root, repoRelativePath)
  const relativePath = relative(root, fullPath)

  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Unsafe repo path: ${repoRelativePath}`)
  }

  return fullPath
}

export function buildTree(dir: string, depth: number, current = 0, prefix = ''): string {
  if (current >= depth) return ''
  let entries: string[]
  try {
    entries = readdirSync(dir).filter(e => !IGNORED_DIRS.includes(e))
  } catch {
    return ''
  }

  return entries
    .map(entry => {
      const full = join(dir, entry)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        return null
      }
      const line = `${prefix}${isDir ? '📁' : '📄'} ${entry}`
      if (isDir) {
        const children = buildTree(full, depth, current + 1, prefix + '  ')
        return children ? `${line}\n${children}` : line
      }
      return line
    })
    .filter(Boolean)
    .join('\n')
}

export function isGreenfield(dir: string): boolean {
  const configFiles = new Set([
    'package.json', 'README.md', 'readme.md', '.gitignore',
    'tsconfig.json', 'jsconfig.json', '.eslintrc.js', '.eslintrc.json',
    '.prettierrc', 'Makefile', 'Cargo.toml', 'go.mod', 'requirements.txt',
    'setup.py', 'pyproject.toml', 'Gemfile', 'pom.xml', 'build.gradle',
  ])

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return true
  }

  const meaningfulFiles = entries.filter(e => {
    if (e.startsWith('.')) return false
    if (configFiles.has(e)) return false
    return true
  })

  return meaningfulFiles.length < 3
}

export function extractCodeSamples(
  dir: string,
  maxFiles = 5,
  maxLines = 80,
): string[] {
  const samples: string[] = []

  function walk(d: string) {
    if (samples.length >= maxFiles) return
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }

    for (const entry of entries) {
      if (samples.length >= maxFiles) break
      if (IGNORED_DIRS.includes(entry)) continue

      const full = join(d, entry)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        walk(full)
      } else if (SOURCE_EXTENSIONS.has(extname(entry).toLowerCase())) {
        try {
          const content = readFileSync(full, 'utf-8')
          const lines = content.split('\n').slice(0, maxLines).join('\n')
          const relativePath = full.replace(dir, '').replace(/\\/g, '/')
          samples.push(`// FILE: ${relativePath}\n${lines}`)
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(dir)
  return samples
}
