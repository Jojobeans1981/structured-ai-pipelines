import { execSync } from 'child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import type { SSEEvent } from './types/sse'
import type { BugReport, CodeMap } from './types/bug'
import type { RootCause, FixPlan, FixFile } from './types/fix'
import type { ConventionsProfile } from './types/conventions'
import { updateForgeRun, addForgeRunLog, saveForgeRunDiagnosis, saveForgeRunDiff } from './db'
import { cloneRepo, buildTree, extractCodeSamples } from './utils/repo'
import { mapCodePaths } from './agents/archaeologist-agent'
import { analyzeRootCause } from './agents/root-cause-agent'
import { planFix } from './agents/fix-planner-agent'
import { scaffoldFix } from './agents/fix-scaffolder-agent'

const STAGE_DATA_FILE = '.forge-debug-stage-data.json'

interface DebugStageData {
  bugReport: BugReport
  codeMap: CodeMap
  rootCause: RootCause
  fixPlan: FixPlan
}

function emitLog(
  emit: (event: SSEEvent) => void,
  runId: string,
  step: string,
  message: string,
  level: 'info' | 'warn' | 'error' | 'success' = 'info',
) {
  emit({ type: 'log', step, level, message })
  addForgeRunLog(runId, { step, level, message }).catch(() => {})
}

function detectCommands(workDir: string): { lint?: string; test?: string } {
  const pkgPath = join(workDir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const scripts = pkg.scripts || {}
      return {
        lint: scripts.lint ? 'npm run lint' : undefined,
        test: scripts.test ? 'npm test' : undefined,
      }
    } catch {
      // ignore parse errors
    }
  }
  return {}
}

export async function runDebugPipelineStage1(opts: {
  userId: string
  runId: string
  bugDescription: string
  repoUrl: string
  emit: (event: SSEEvent) => void
}): Promise<void> {
  const { userId, runId, bugDescription, repoUrl, emit } = opts
  const workDir = join(tmpdir(), `forge-${runId}`)

  // 1. Clone repo
  emitLog(emit, runId, 'Clone', `Cloning ${repoUrl}...`)
  mkdirSync(workDir, { recursive: true })
  await cloneRepo(repoUrl, workDir)
  emitLog(emit, runId, 'Clone', 'Repository cloned', 'success')

  // 2. Build tree and extract code samples
  const tree = buildTree(workDir, 3)
  const codeSamples = extractCodeSamples(workDir, 5, 80)
  emitLog(emit, runId, 'Analyze', `Extracted ${codeSamples.length} code samples`)

  // 3. Structure bug report
  const bugReport: BugReport = {
    description: bugDescription,
    errorLogs: extractErrorLogs(bugDescription),
    symptoms: extractSymptoms(bugDescription),
  }

  // 4. Map code paths
  emitLog(emit, runId, 'Archaeologist', 'Mapping affected code paths...')
  const codeMap = await mapCodePaths(userId, bugReport, tree, codeSamples)
  emitLog(emit, runId, 'Archaeologist', `Mapped ${codeMap.affectedFiles.length} affected files`, 'success')

  // 5. Analyze root cause
  emitLog(emit, runId, 'RootCause', 'Analyzing root cause...')
  const rootCause = await analyzeRootCause(userId, bugReport, codeMap)
  emitLog(emit, runId, 'RootCause', `Root cause (${rootCause.confidence}): ${rootCause.cause}`, 'success')

  // 6. Plan fix
  emitLog(emit, runId, 'FixPlanner', 'Planning fix steps...')
  const fixPlan = await planFix(userId, bugReport, rootCause, codeMap)
  emitLog(emit, runId, 'FixPlanner', `Fix plan: ${fixPlan.steps.length} steps`, 'success')

  // 7. Save stage data
  const stageData: DebugStageData = { bugReport, codeMap, rootCause, fixPlan }
  writeFileSync(join(workDir, STAGE_DATA_FILE), JSON.stringify(stageData, null, 2))

  // 8. Save diagnosis
  await saveForgeRunDiagnosis(runId, {
    rootCause: rootCause.cause,
    affectedFiles: codeMap.affectedFiles,
    fixPlan: fixPlan.steps,
  })

  // 9. Emit events
  emit({
    type: 'diagnosis',
    rootCause: rootCause.cause,
    affectedFiles: codeMap.affectedFiles,
    fixPlan: fixPlan.steps,
  })

  emit({
    type: 'plan',
    stage: 'plan',
    rootCause: rootCause.cause,
    affectedFiles: codeMap.affectedFiles,
    fixPlan: fixPlan.steps,
  })

  emit({ type: 'status', status: 'awaiting_approval', stage: 'plan' })
}

export async function runDebugPipelineStage2(opts: {
  userId: string
  runId: string
  repoUrl: string
  emit: (event: SSEEvent) => void
  continuous?: boolean
}): Promise<void> {
  const { userId, runId, emit, continuous = false } = opts
  const workDir = join(tmpdir(), `forge-${runId}`)

  // 1. Load stage data
  const stageDataPath = join(workDir, STAGE_DATA_FILE)
  if (!existsSync(stageDataPath)) {
    throw new Error('Debug stage data not found — Stage 1 may not have completed')
  }
  const stageData: DebugStageData = JSON.parse(readFileSync(stageDataPath, 'utf-8'))
  const { bugReport, codeMap, rootCause, fixPlan: initialFixPlan } = stageData

  let currentFixPlan = initialFixPlan
  let lintPassed = true
  let testsPassed = true
  let errors: string[] = []
  let finalFiles: Array<{ path: string; content: string }> = []

  const cycleLimit = continuous ? 10 : 1

  for (let cycle = 1; cycle <= cycleLimit; cycle++) {
    emitLog(emit, runId, 'FixScaffold', cycle === 1 ? 'Generating initial fixes...' : `Auto-fix cycle ${cycle}/${cycleLimit}: repairing remaining issues...`)

    // 2. Scaffold fixes
    const fixFiles: FixFile[] = []
    for (const step of currentFixPlan.steps) {
      emitLog(emit, runId, 'FixScaffold', `Generating fix for ${step.file}...`)

      // Read existing content if modifying
      let existingContent: string | null = null
      if (step.action !== 'create') {
        const filePath = join(workDir, step.file)
        if (existsSync(filePath)) {
          existingContent = readFileSync(filePath, 'utf-8')
        }
      }

      const fixFile = await scaffoldFix(userId, step, existingContent, rootCause)
      fixFiles.push(fixFile)
      emitLog(emit, runId, 'FixScaffold', `Generated fix for ${step.file}`, 'success')
    }

    // 3. Write files
    for (const file of fixFiles) {
      const fullPath = join(workDir, file.path)
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, file.content, 'utf-8')

      // Record lesson
      await addForgeLessonLearned({
        runId,
        phase: cycle,
        phaseName: 'Debug Fix',
        error: bugReport.description,
        fix: `Updated ${file.path}`,
        rootCause: rootCause.cause,
        preventionRule: `Ensure fix for ${file.path} addresses root cause: ${rootCause.cause}`,
      })
    }

    // 4. Run lint/test
    const commands = detectCommands(workDir)
    lintPassed = true
    testsPassed = true
    errors = []

    if (commands.lint) {
      try {
        emitLog(emit, runId, 'Verify', `Running lint: ${commands.lint}`)
        execSync(commands.lint, { cwd: workDir, timeout: 60000, stdio: 'pipe' })
        emitLog(emit, runId, 'Verify', 'Lint passed', 'success')
      } catch (err) {
        lintPassed = false
        const msg = err instanceof Error ? err.message : 'Lint failed'
        errors.push(`Lint: ${msg.slice(0, 500)}`)
        emitLog(emit, runId, 'Verify', 'Lint failed', 'warn')
      }
    }

    if (commands.test) {
      try {
        emitLog(emit, runId, 'Verify', `Running tests: ${commands.test}`)
        execSync(commands.test, { cwd: workDir, timeout: 120000, stdio: 'pipe' })
        emitLog(emit, runId, 'Verify', 'Tests passed', 'success')
      } catch (err) {
        testsPassed = false
        const msg = err instanceof Error ? err.message : 'Tests failed'
        errors.push(`Tests: ${msg.slice(0, 500)}`)
        emitLog(emit, runId, 'Verify', 'Tests failed', 'warn')
      }
    }

    finalFiles = fixFiles.map(f => ({ path: f.path, content: f.content }))

    if (errors.length === 0) {
      break
    }

    if (cycle === cycleLimit) {
      emitLog(emit, runId, 'AutoFix', `Auto-fix limit reached after ${cycleLimit} cycle(s)`, 'warn')
      break
    }

    // 5. Plan next cycle fixes
    emitLog(emit, runId, 'AutoFix', 'Planning follow-up repairs...')
    const cycleBugReport: BugReport = {
      ...bugReport,
      errorLogs: errors.join('\n\n'),
    }
    const nextFixPlan = await planFix(userId, cycleBugReport, rootCause, codeMap)
    if (nextFixPlan.steps.length === 0) {
      emitLog(emit, runId, 'AutoFix', 'Planner returned no further repair steps', 'warn')
      break
    }
    currentFixPlan = nextFixPlan
  }

  // 6. Save diff
  await saveForgeRunDiff(runId, {
    files: finalFiles,
    lintPassed,
    testsPassed,
    errors,
  })

  // 7. Emit events
  emit({
    type: 'diff',
    files: finalFiles,
    lintPassed,
    testsPassed,
    errors,
  })

  emit({ type: 'status', status: 'awaiting_approval', stage: 'code' })
}

/** Extract error logs from bug description (lines that look like stack traces or error messages) */
function extractErrorLogs(description: string): string {
  const lines = description.split('\n')
  const errorLines = lines.filter(l =>
    /error|exception|traceback|stack|at\s+\w|panic|fatal|failed/i.test(l)
  )
  return errorLines.join('\n') || 'No explicit error logs provided'
}

/** Extract symptom description from bug description */
function extractSymptoms(description: string): string {
  const lines = description.split('\n')
  const symptomLines = lines.filter(l =>
    !/error|exception|traceback|stack|at\s+\w|panic|fatal/i.test(l)
  ).filter(l => l.trim())
  return symptomLines.slice(0, 5).join('\n') || description.slice(0, 500)
}
