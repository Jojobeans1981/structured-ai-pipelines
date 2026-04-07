import { execSync } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import liveLiteFixtures from '../../../benchmarks/forge/live-lite-cases.json'
import { createForgeRun, getForgeRunWithDetails } from './db'
import { runBuildPipelineStage1, runBuildPipelineStage2 } from './build-pipeline'
import type { SSEDiffEvent, SSEEvent } from './types/sse'

interface LiveLiteRepoFile {
  filePath: string
  content: string
}

export interface ForgeLiveLiteScenario {
  id: string
  name: string
  type: 'greenfield' | 'repo-recovery' | 'strategic-module'
  repoUrl: string
  specFilename: string
  specContent: string
  repoFiles?: LiveLiteRepoFile[]
  expectedSignals: string[]
}

export interface ForgeLiveLiteExecutionResult {
  scenarioId: string
  name: string
  runId: string | null
  passed: boolean
  score: number
  status: string
  details: string[]
  error?: string | null
}

function getScenarios(): ForgeLiveLiteScenario[] {
  return [...(liveLiteFixtures.scenarios as ForgeLiveLiteScenario[])]
}

function writeRepoFile(repoDir: string, file: LiveLiteRepoFile): void {
  const fullPath = join(repoDir, file.filePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, file.content, 'utf-8')
}

function initGitRepo(repoDir: string): void {
  execSync('git init', { cwd: repoDir, stdio: 'pipe' })
  execSync('git config user.email "forge-benchmark@local.dev"', { cwd: repoDir, stdio: 'pipe' })
  execSync('git config user.name "Forge Benchmark"', { cwd: repoDir, stdio: 'pipe' })
  execSync('git add .', { cwd: repoDir, stdio: 'pipe' })
  execSync('git commit -m "Seed live-lite benchmark repo"', { cwd: repoDir, stdio: 'pipe' })
}

export function materializeLiveLiteScenarioRepo(scenario: ForgeLiveLiteScenario): string {
  const rootDir = mkdtempSync(join(tmpdir(), `forge-live-lite-${scenario.id}-`))
  const repoDir = join(rootDir, 'repo')
  mkdirSync(repoDir, { recursive: true })

  for (const file of scenario.repoFiles || []) {
    writeRepoFile(repoDir, file)
  }

  initGitRepo(repoDir)
  return repoDir
}

function getLatestDiffEvent(events: SSEEvent[]): SSEDiffEvent | null {
  const diffEvents = events.filter((event): event is SSEDiffEvent => event.type === 'diff')
  return diffEvents[diffEvents.length - 1] || null
}

function scoreSignal(signal: string, diff: SSEDiffEvent | null): { ok: boolean; detail: string } {
  const files = diff?.files || []
  const filePaths = new Set(files.map((file) => file.path))
  const packageJson = files.find((file) => file.path === 'package.json')
  const packageText = packageJson?.content || ''
  const mainEntry = files.find((file) => file.path === 'src/main.tsx' || file.path === 'src/main.jsx' || file.path === 'src/index.tsx' || file.path === 'src/index.jsx')

  switch (signal) {
    case 'package.json':
      return { ok: filePaths.has('package.json'), detail: 'Final diff contains package.json' }
    case 'index.html':
      return { ok: filePaths.has('index.html'), detail: 'Final diff contains index.html' }
    case 'src/main':
      return { ok: Boolean(mainEntry), detail: 'Final diff contains a browser entrypoint' }
    case 'previewable':
      return { ok: !!diff && diff.errors.length === 0, detail: 'Final diff reached a previewable state without blocking errors' }
    case 'vite':
      return { ok: packageText.includes('"vite"') || filePaths.has('vite.config.ts'), detail: 'Final diff contains Vite scaffolding' }
    case 'import-repair':
      return { ok: Boolean(mainEntry?.content && !mainEntry.content.includes("from './App'")), detail: 'Main entry import no longer points at a broken ./App path' }
    case 'delivery-guard-pass':
      return { ok: !((diff?.errors || []).some((error) => error.startsWith('Delivery Guard:'))), detail: 'Delivery guard blockers are absent from the final diff' }
    case 'manager-dashboard':
      return {
        ok: files.some((file) => /manager|dashboard/i.test(file.path) || /manager|dashboard/i.test(file.content)),
        detail: 'Final diff contains manager/dashboard-oriented implementation signals',
      }
    default:
      return { ok: true, detail: `Signal ${signal} not yet scored explicitly` }
  }
}

function buildExecutionResult(
  scenario: ForgeLiveLiteScenario,
  runId: string,
  events: SSEEvent[],
  finalStatus: string,
  error?: string | null,
): ForgeLiveLiteExecutionResult {
  const diff = getLatestDiffEvent(events)
  const checks = [
    { ok: finalStatus === 'awaiting_approval', detail: `Run reached ${finalStatus}` },
    ...scenario.expectedSignals.map((signal) => scoreSignal(signal, diff)),
  ]
  const passedChecks = checks.filter((check) => check.ok).length
  const score = Math.round((passedChecks / checks.length) * 100)

  return {
    scenarioId: scenario.id,
    name: scenario.name,
    runId,
    passed: passedChecks === checks.length,
    score,
    status: finalStatus,
    details: checks.map((check) => `${check.ok ? 'PASS' : 'FAIL'}: ${check.detail}`),
    error: error || null,
  }
}

export async function executeForgeLiveLiteScenario(userId: string, scenarioId: string): Promise<ForgeLiveLiteExecutionResult> {
  const scenario = getScenarios().find((entry) => entry.id === scenarioId)
  if (!scenario) {
    throw new Error(`Unknown live-lite scenario: ${scenarioId}`)
  }

  const repoDir = materializeLiveLiteScenarioRepo(scenario)
  const events: SSEEvent[] = []
  const emit = (event: SSEEvent) => {
    events.push(event)
  }

  let runId: string | null = null

  try {
    const run = await createForgeRun(userId, {
      mode: 'build',
      repoUrl: repoDir,
      specContent: scenario.specContent,
      specFilename: scenario.specFilename,
    })
    runId = run.id

    await runBuildPipelineStage1({
      userId,
      runId,
      specContent: scenario.specContent,
      repoUrl: repoDir,
      emit,
    })

    await runBuildPipelineStage2({
      userId,
      runId,
      repoUrl: repoDir,
      emit,
    })

    const details = await getForgeRunWithDetails(runId)
    return buildExecutionResult(scenario, runId, events, details?.run.status || 'unknown', details?.run.error || null)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown live-lite execution failure'
    if (runId) {
      return buildExecutionResult(scenario, runId, events, 'failed', message)
    }
    return {
      scenarioId: scenario.id,
      name: scenario.name,
      runId: null,
      passed: false,
      score: 0,
      status: 'failed',
      details: [`FAIL: ${message}`],
      error: message,
    }
  } finally {
    rmSync(join(repoDir, '..'), { recursive: true, force: true })
  }
}

export function listForgeLiveLiteScenarios(): ForgeLiveLiteScenario[] {
  return getScenarios()
}
