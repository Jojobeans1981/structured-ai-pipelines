import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import type { SSEEvent } from './types/sse'
import type { ConventionsProfile } from './types/conventions'
import type { PRDOutput } from './types/prd'
import type { ScaffoldedFile } from './types/scaffold'
import { updateForgeRun, addForgeRunLog, saveForgeRunDiff, addForgeLessonLearned } from './db'
import { cloneRepo, buildTree, isGreenfield, extractCodeSamples } from './utils/repo'
import { analyzeRepo } from './agents/analyzer-agent'
import { generatePRD } from './agents/prd-agent'
import { generateManifest } from './agents/prompt-agent'
import { scaffoldFile } from './agents/scaffolder-agent'
import { validateFiles } from './agents/validator-agent'
import { buildForgeLessonsSection } from './lessons-context'

const MAX_VALIDATION_CYCLES = 3
const STAGE_DATA_FILE = '.forge-stage-data.json'

interface BuildStageData {
  conventions: ConventionsProfile
  prd: PRDOutput
  greenfield: boolean
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

export async function runBuildPipelineStage1(opts: {
  userId: string
  runId: string
  specContent: string
  repoUrl: string
  emit: (event: SSEEvent) => void
}): Promise<void> {
  const { userId, runId, specContent, repoUrl, emit } = opts
  const workDir = join(tmpdir(), `forge-${runId}`)

  // 1. Clone repo
  emitLog(emit, runId, 'Clone', `Cloning ${repoUrl}...`)
  mkdirSync(workDir, { recursive: true })
  await cloneRepo(repoUrl, workDir)
  emitLog(emit, runId, 'Clone', 'Repository cloned', 'success')

  // 2. Detect greenfield
  const greenfield = isGreenfield(workDir)
  emitLog(emit, runId, 'Analyze', greenfield ? 'Greenfield repo detected' : 'Existing repo detected')

  // 3. Build tree
  const tree = buildTree(workDir, 3)

  // 4. Extract code samples
  const codeSamples = extractCodeSamples(workDir, 5, 80)
  emitLog(emit, runId, 'Analyze', `Extracted ${codeSamples.length} code samples`)

  // 5. Analyze conventions
  emitLog(emit, runId, 'Analyze', 'Detecting repo conventions...')
  const conventions = await analyzeRepo(userId, tree, codeSamples)
  emitLog(emit, runId, 'Analyze', `Detected: ${conventions.language} / ${conventions.framework ?? 'no framework'}`, 'success')

  // 6. Generate PRD
  emitLog(emit, runId, 'PRD', 'Generating product requirements...')
  const prd = await generatePRD({
    userId,
    specContent,
    conventions,
    greenfield,
    lessonsContext: '',
  })
  emitLog(emit, runId, 'PRD', `PRD generated: ${prd.title}`, 'success')

  // 7. Save stage data to disk
  const stageData: BuildStageData = { conventions, prd, greenfield }
  writeFileSync(join(workDir, STAGE_DATA_FILE), JSON.stringify(stageData, null, 2))

  // 8. Update ForgeRun
  await updateForgeRun(runId, { prdTitle: prd.title, prdSummary: prd.summary })

  // 9. Emit plan event
  emit({
    type: 'plan',
    stage: 'plan',
    prdTitle: prd.title,
    prdSummary: prd.summary,
    prdFullText: prd.fullText,
  })

  emit({ type: 'status', status: 'awaiting_approval', stage: 'plan' })
}

export async function runBuildPipelineStage2(opts: {
  userId: string
  runId: string
  repoUrl: string
  emit: (event: SSEEvent) => void
}): Promise<void> {
  const { userId, runId, emit } = opts
  const workDir = join(tmpdir(), `forge-${runId}`)

  // 1. Load stage data
  const stageDataPath = join(workDir, STAGE_DATA_FILE)
  if (!existsSync(stageDataPath)) {
    throw new Error('Stage data not found — Stage 1 may not have completed')
  }
  const stageData: BuildStageData = JSON.parse(readFileSync(stageDataPath, 'utf-8'))
  const { conventions, prd } = stageData

  // 2. Build lessons context
  const lessonsContext = await buildForgeLessonsSection(
    conventions.language,
    conventions.framework ?? undefined,
  )

  // 3. Generate manifest
  emitLog(emit, runId, 'Manifest', 'Generating implementation plan...')
  const manifest = await generateManifest({ userId, prdFullText: prd.fullText, conventions })
  emitLog(emit, runId, 'Manifest', `Plan: ${manifest.files.length} files to generate`, 'success')

  // 4. Scaffold each file
  const scaffoldedFiles: ScaffoldedFile[] = []
  const contentMap: Record<string, string> = {}

  for (const file of manifest.files) {
    emitLog(emit, runId, 'Scaffold', `Generating ${file.path}...`)

    // Collect dependency contents
    const dependencyContents: Record<string, string> = {}
    for (const dep of file.dependencies) {
      if (contentMap[dep]) {
        dependencyContents[dep] = contentMap[dep]
      }
    }

    const content = await scaffoldFile({
      userId,
      file,
      conventions,
      dependencyContents,
      fullManifest: manifest.files,
      lessonsContext,
    })

    scaffoldedFiles.push({ path: file.path, content })
    contentMap[file.path] = content
    emitLog(emit, runId, 'Scaffold', `Generated ${file.path}`, 'success')
  }

  // 5. Validation loop
  let currentFiles = [...scaffoldedFiles]
  for (let cycle = 1; cycle <= MAX_VALIDATION_CYCLES; cycle++) {
    emitLog(emit, runId, 'Validate', `Running validation cycle ${cycle}/${MAX_VALIDATION_CYCLES}...`)
    const result = await validateFiles(userId, currentFiles)

    if (result.passed) {
      emitLog(emit, runId, 'Validate', 'All validations passed', 'success')
      break
    }

    emitLog(emit, runId, 'Validate', `Found ${result.issues.length} issues, applying ${result.fixes.length} fixes`, 'warn')

    // Apply fixes
    for (const fix of result.fixes) {
      const idx = currentFiles.findIndex(f => f.path === fix.file)
      if (idx >= 0) {
        currentFiles[idx] = { path: fix.file, content: fix.content }
      } else {
        currentFiles.push({ path: fix.file, content: fix.content })
      }

      // Record lesson
      await addForgeLessonLearned({
        runId,
        phase: cycle,
        phaseName: 'Validation',
        error: fix.description,
        fix: `Updated ${fix.file}`,
        rootCause: fix.description,
        preventionRule: `Ensure correctness of ${fix.file}: ${fix.description}`,
        language: conventions.language,
        framework: conventions.framework ?? undefined,
      })
    }

    if (cycle === MAX_VALIDATION_CYCLES) {
      emitLog(emit, runId, 'Validate', 'Max validation cycles reached — proceeding with best effort', 'warn')
    }
  }

  // 6. Write files to work dir
  for (const file of currentFiles) {
    const fullPath = join(workDir, file.path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, file.content, 'utf-8')
  }

  // 7-8. Run lint/test
  let lintPassed = true
  let testsPassed = true
  const errors: string[] = []

  if (conventions.lintCommand) {
    try {
      emitLog(emit, runId, 'Verify', `Running lint: ${conventions.lintCommand}`)
      execSync(conventions.lintCommand, { cwd: workDir, timeout: 60000, stdio: 'pipe' })
      emitLog(emit, runId, 'Verify', 'Lint passed', 'success')
    } catch (err) {
      lintPassed = false
      const msg = err instanceof Error ? err.message : 'Lint failed'
      errors.push(`Lint: ${msg.slice(0, 500)}`)
      emitLog(emit, runId, 'Verify', 'Lint failed', 'warn')
    }
  }

  if (conventions.testCommand) {
    try {
      emitLog(emit, runId, 'Verify', `Running tests: ${conventions.testCommand}`)
      execSync(conventions.testCommand, { cwd: workDir, timeout: 120000, stdio: 'pipe' })
      emitLog(emit, runId, 'Verify', 'Tests passed', 'success')
    } catch (err) {
      testsPassed = false
      const msg = err instanceof Error ? err.message : 'Tests failed'
      errors.push(`Tests: ${msg.slice(0, 500)}`)
      emitLog(emit, runId, 'Verify', 'Tests failed', 'warn')
    }
  }

  // 9. Save diff
  await saveForgeRunDiff(runId, {
    files: currentFiles.map(f => ({ path: f.path, content: f.content })),
    lintPassed,
    testsPassed,
    errors,
  })

  // 10. Emit diff event
  emit({
    type: 'diff',
    files: currentFiles.map(f => ({ path: f.path, content: f.content })),
    lintPassed,
    testsPassed,
    errors,
  })

  emit({ type: 'status', status: 'awaiting_approval', stage: 'code' })
}
