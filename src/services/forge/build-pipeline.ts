import path from 'path';
import fsP from 'fs/promises';
import { GitTracker } from '@/src/services/git-tracker'
import { ScaffoldEngine } from '@/src/services/scaffold-engine'
import { prisma } from '@/src/lib/prisma'
import { DependencyPinner } from '@/src/services/dependency-pinner'
import { execSync } from 'child_process'
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync } from 'fs'
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
import { evaluateLaunchReadiness } from './agents/launcher-agent'
import { finishLaunchReadiness } from './agents/finisher-agent'
import { evaluatePreviewReadiness, type PreviewAssessment } from './agents/preview-agent'
import { runDeliveryGuard } from './agents/delivery-guard-agent'
import { buildForgeLessonsSection } from './lessons-context'
import { CompletenessPass, detectProjectType } from '@/src/services/completeness-pass'
import { BuildVerifier } from '@/src/services/build-verifier'
import { TestGenerator } from '@/src/services/test-generator'
import { DockerfileGenerator } from '@/src/services/dockerfile-generator'
import { CIGenerator } from '@/src/services/ci-generator'
import { SBOMScanner } from '@/src/services/sbom-scanner'
import { DockerSandbox } from '@/src/services/docker-sandbox'
import type { ProjectType } from '@/src/types/dag'
import type { BugReport, CodeMap } from './types/bug'
import type { RootCause } from './types/fix'
import { mapCodePaths } from './agents/archaeologist-agent'
import { analyzeRootCause } from './agents/root-cause-agent'
import { planFix } from './agents/fix-planner-agent'
import { scaffoldFix } from './agents/fix-scaffolder-agent'

const MAX_VALIDATION_CYCLES = 3
const MAX_BUILD_FIX_CYCLES = parseInt(process.env.FORGE_MAX_AUTO_FIX || '3', 10)
const STAGE_DATA_FILE = '.forge-stage-data.json'
const IGNORED_REPO_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv'])

interface BuildStageData {
  conventions: ConventionsProfile
  prd: PRDOutput
  greenfield: boolean
}

interface RepoFile {
  filePath: string
  content: string
}

function mergePreviewIntoLaunchAssessment(
  launchAssessment: Awaited<ReturnType<typeof evaluateLaunchReadiness>>,
  previewAssessment: PreviewAssessment,
): Awaited<ReturnType<typeof evaluateLaunchReadiness>> {
  return {
    ...launchAssessment,
    ready: previewAssessment.ready,
    startCommand: previewAssessment.startCommand || launchAssessment.startCommand,
    expectedPort: previewAssessment.expectedPort ?? launchAssessment.expectedPort,
    blockers: Array.from(new Set([...launchAssessment.blockers, ...previewAssessment.blockers])),
    summary: previewAssessment.summary || launchAssessment.summary,
  }
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

function writeRepoFile(workDir: string, filePath: string, content: string): void {
  const fullPath = join(workDir, filePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
}

function readRepoFiles(workDir: string, dir = workDir): RepoFile[] {
  const files: RepoFile[] = []

  for (const entry of readdirSync(dir)) {
    if (IGNORED_REPO_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    let stats
    try {
      stats = statSync(fullPath)
    } catch {
      continue
    }

    if (stats.isDirectory()) {
      files.push(...readRepoFiles(workDir, fullPath))
      continue
    }

    try {
      const content = readFileSync(fullPath, 'utf-8')
      const filePath = fullPath.slice(workDir.length + 1).replace(/\\/g, '/')
      files.push({ filePath, content })
    } catch {
      // Skip binary or unreadable files.
    }
  }

  return files
}

function updateModifiedFiles(
  modifiedFiles: Map<string, string>,
  files: Array<{ filePath: string; content: string }>,
  workDir: string,
): void {
  for (const file of files) {
    writeRepoFile(workDir, file.filePath, file.content)
    modifiedFiles.set(file.filePath, file.content)
  }
}

function inferProjectName(repoUrl: string, projectFiles: RepoFile[]): string {
  const packageJson = projectFiles.find((file) => file.filePath === 'package.json')
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson.content) as { name?: string }
      if (parsed.name) {
        return parsed.name
      }
    } catch {
      // fall through to repo name inference
    }
  }

  try {
    const url = new URL(repoUrl)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const repoName = pathParts[pathParts.length - 1] ?? 'forge-app'
    return repoName.replace(/\.git$/, '')
  } catch {
    return 'forge-app'
  }
}

function inferNodeCommands(workDir: string, conventions: ConventionsProfile): {
  lintCommand: string | null
  testCommand: string | null
} {
  const fallback = {
    lintCommand: conventions.lintCommand ?? null,
    testCommand: conventions.testCommand ?? null,
  }

  const packageJsonPath = join(workDir, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return fallback
  }

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      scripts?: Record<string, string>
    }
    const scripts = pkg.scripts ?? {}
    return {
      lintCommand: fallback.lintCommand ?? (scripts.lint ? 'npm run lint' : null),
      testCommand: fallback.testCommand ?? (scripts.test ? 'npm test' : null),
    }
  } catch {
    return fallback
  }
}

function buildBugReportFromErrors(runId: string, cycle: number, errors: string[]): BugReport {
  const errorLogs = errors.join('\n\n')
  return {
    description: `Forge build auto-fix cycle ${cycle} for run ${runId}.\n\nThe generated project failed verification and needs targeted repairs.`,
    errorLogs,
    symptoms: errors
      .map((error) => error.split('\n')[0]?.trim() ?? error.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join('\n'),
  }
}

async function runBuildAutoFixCycle(opts: {
  userId: string
  runId: string
  workDir: string
  modifiedFiles: Map<string, string>
  errors: string[]
  emit: (event: SSEEvent) => void
  cycle: number
  cycleLimit: number
  language: string
  framework?: string
}): Promise<boolean> {
  const { userId, runId, workDir, modifiedFiles, errors, emit, cycle, cycleLimit, language, framework } = opts
  const bugReport = buildBugReportFromErrors(runId, cycle, errors)
  const tree = buildTree(workDir, 3)
  const codeSamples = extractCodeSamples(workDir, 8, 120)

  emitLog(emit, runId, 'AutoFix', `Auto-fix cycle ${cycle}/${cycleLimit}: mapping impacted code...`)
  const codeMap: CodeMap = await mapCodePaths(userId, bugReport, tree, codeSamples)

  emitLog(emit, runId, 'AutoFix', 'Analyzing root cause from verifier errors...')
  const rootCause: RootCause = await analyzeRootCause(userId, bugReport, codeMap)
  emitLog(emit, runId, 'AutoFix', `Root cause (${rootCause.confidence}): ${rootCause.cause}`, 'success')

  emitLog(emit, runId, 'AutoFix', 'Planning targeted repairs...')
  const fixPlan = await planFix(userId, bugReport, rootCause, codeMap)
  if (fixPlan.steps.length === 0) {
    emitLog(emit, runId, 'AutoFix', 'Planner returned no repair steps', 'warn')
    return false
  }

  let appliedChanges = 0

  for (const step of fixPlan.steps) {
    if (step.action === 'delete') {
      emitLog(emit, runId, 'AutoFix', `Skipping delete step for ${step.file}; Forge publish does not support deletions yet`, 'warn')
      continue
    }

    emitLog(emit, runId, 'AutoFix', `Repairing ${step.file} (${step.action})...`)
    const existingPath = join(workDir, step.file)
    const existingContent = existsSync(existingPath) ? readFileSync(existingPath, 'utf-8') : null
    const fixFile = await scaffoldFix(userId, step, existingContent, rootCause)
    updateModifiedFiles(modifiedFiles, [{ filePath: fixFile.path, content: fixFile.content }], workDir)
    appliedChanges += 1

    await addForgeLessonLearned({
      runId,
      phase: cycle,
      phaseName: 'Build Auto-Fix',
      error: errors.join('\n\n').slice(0, 4000),
      fix: `Updated ${fixFile.path}`,
      rootCause: rootCause.cause,
      preventionRule: fixPlan.summary || `Address verifier-reported failure in ${fixFile.path}`,
      language,
      framework,
    })
  }

  if (appliedChanges === 0) {
    emitLog(emit, runId, 'AutoFix', 'No repair steps could be applied', 'warn')
    return false
  }

  emitLog(emit, runId, 'AutoFix', `Applied ${appliedChanges} targeted repair${appliedChanges === 1 ? '' : 's'}`, 'success')
  return true
}

async function runLaunchFinisherCycle(opts: {
  userId: string
  runId: string
  workDir: string
  modifiedFiles: Map<string, string>
  repoFiles: RepoFile[]
  launchAssessment: Awaited<ReturnType<typeof evaluateLaunchReadiness>>
  emit: (event: SSEEvent) => void
  cycle: number
  cycleLimit: number
  language: string
  framework?: string
}): Promise<boolean> {
  const { userId, runId, workDir, modifiedFiles, repoFiles, launchAssessment, emit, cycle, cycleLimit, language, framework } = opts

  emitLog(emit, runId, 'Launcher', `Finisher cycle ${cycle}/${cycleLimit}: repairing launch blockers...`)
  const finisherResult = await finishLaunchReadiness({
    userId,
    files: repoFiles,
    assessment: launchAssessment,
  })

  if (finisherResult.fixes.length === 0) {
    emitLog(emit, runId, 'Launcher', 'Finisher returned no file changes', 'warn')
    return false
  }

  updateModifiedFiles(
    modifiedFiles,
    finisherResult.fixes.map((fix) => ({ filePath: fix.file, content: fix.content })),
    workDir,
  )

  for (const fix of finisherResult.fixes) {
    await addForgeLessonLearned({
      runId,
      phase: cycle,
      phaseName: 'Launch Finisher',
      error: launchAssessment.blockers.join('\n').slice(0, 4000),
      fix: `Updated ${fix.file}`,
      rootCause: launchAssessment.summary || 'Launch readiness blockers detected by launcher agent',
      preventionRule: fix.description || finisherResult.summary || 'Ensure generated projects are runnable before publish',
      language,
      framework,
    })
  }

  emitLog(emit, runId, 'Launcher', `Finisher applied ${finisherResult.fixes.length} launch repair${finisherResult.fixes.length === 1 ? '' : 's'}`, 'success')
  return true
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

  // --- FORGE INJECTION: Scaffold Engine ---
  try {
    await ScaffoldEngine.injectReactViteScaffold(workDir);
    if (typeof emitLog === 'function' && typeof emit !== 'undefined') {
      emitLog(emit, runId, 'Prepare', 'Injected Golden Scaffold (Vite/React/Tailwind) into workDir');
    } else {
      console.log('[ScaffoldEngine] Injected Golden Configs.');
    }
  } catch(e) {
    console.warn('Scaffold injection error:', e);
  }

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
  continuous?: boolean
}): Promise<void> {
  const { userId, runId, repoUrl, emit, continuous = false } = opts
  const workDir = join(tmpdir(), `forge-${runId}`)

  // --- FORGE INJECTION: Scaffold Engine ---
  try {
    await ScaffoldEngine.injectReactViteScaffold(workDir);
    if (typeof emitLog === 'function' && typeof emit !== 'undefined') {
      emitLog(emit, runId, 'Prepare', 'Injected Golden Scaffold (Vite/React/Tailwind) into workDir');
    } else {
      console.log('[ScaffoldEngine] Injected Golden Configs.');
    }
  } catch(e) {
    console.warn('Scaffold injection error:', e);
  }

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
  let validationPassed = false
  let validationIssues: string[] = []
  for (let cycle = 1; cycle <= MAX_VALIDATION_CYCLES; cycle++) {
    emitLog(emit, runId, 'Validate', `Running validation cycle ${cycle}/${MAX_VALIDATION_CYCLES}...`)
    const result = await validateFiles(userId, currentFiles)
    validationPassed = result.passed
    validationIssues = result.issues.map((issue) => `${issue.phase}: ${issue.description}`)

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
      for (const issue of validationIssues) {
        emitLog(emit, runId, 'Validate', issue, 'warn')
      }
      emitLog(emit, runId, 'Validate', 'Max validation cycles reached — proceeding with best effort', 'warn')
    }
  }

  // 6. Materialize the generated files on top of the checked-out repo.
  const modifiedFiles = new Map<string, string>()
  updateModifiedFiles(
    modifiedFiles,
    currentFiles.map((file) => ({ filePath: file.path, content: file.content })),
    workDir,
  )

  let lintPassed = true
  let testsPassed = true
  let errors: string[] = []
  let finalFiles: Array<{ path: string; content: string }> = []

  const cycleLimit = continuous ? 20 : MAX_BUILD_FIX_CYCLES

  for (let cycle = 0; cycle <= cycleLimit; cycle++) {
    let repoFiles = readRepoFiles(workDir)
    let projectType: ProjectType = detectProjectType(repoFiles.map((file) => ({ filePath: file.filePath })))

    emitLog(emit, runId, 'Complete', cycle === 0 ? 'Running completeness pass...' : `Re-running completeness pass after auto-fix ${cycle}/${cycleLimit}...`)
    const completenessResult = CompletenessPass.run(repoFiles, projectType)
    if (completenessResult.files.length > 0) {
      updateModifiedFiles(modifiedFiles, completenessResult.files, workDir)
      emitLog(emit, runId, 'Complete', `Scaffolded ${completenessResult.files.length} critical files`, 'success')
    } else {
      emitLog(emit, runId, 'Complete', 'Completeness pass found no missing critical files', 'success')
    }

    repoFiles = readRepoFiles(workDir)
    projectType = detectProjectType(repoFiles.map((file) => ({ filePath: file.filePath })))

    emitLog(emit, runId, 'Artifacts', cycle === 0 ? 'Scaffolding tests, Docker, CI, and SBOM...' : `Refreshing launch artifacts after auto-fix ${cycle}/${cycleLimit}...`)
    const testResult = TestGenerator.scaffold(repoFiles, projectType)
    const testFiles = [...testResult.configFiles, ...testResult.files]
    if (testFiles.length > 0) {
      updateModifiedFiles(modifiedFiles, testFiles, workDir)
    }

    if (projectType === 'node') {
      const packageJson = repoFiles.find((file) => file.filePath === 'package.json')
      if (packageJson) {
        const updatedPackageJson = TestGenerator.mergeTestDeps(packageJson.content, projectType)
        if (updatedPackageJson !== packageJson.content) {
          updateModifiedFiles(modifiedFiles, [{ filePath: 'package.json', content: updatedPackageJson }], workDir)
        }
      }
    }

    repoFiles = readRepoFiles(workDir)
    const projectName = inferProjectName(repoUrl, repoFiles)

    const dockerResult = DockerfileGenerator.generate(repoFiles, { projectName, projectType })
    if (dockerResult.files.length > 0) {
      updateModifiedFiles(modifiedFiles, dockerResult.files, workDir)
    }

    const ciResult = CIGenerator.generate(repoFiles, projectType, projectName)
    if (ciResult.files.length > 0) {
      updateModifiedFiles(modifiedFiles, ciResult.files, workDir)
    }

    const sbomResult = SBOMScanner.scan(repoFiles)
    if (sbomResult.components.length > 0) {
      updateModifiedFiles(modifiedFiles, [{ filePath: 'sbom.cdx.json', content: SBOMScanner.toCycloneDX(sbomResult, projectName) }], workDir)
    }

    const artifactCount = testFiles.length + dockerResult.files.length + ciResult.files.length + (sbomResult.components.length > 0 ? 1 : 0)
    emitLog(emit, runId, 'Artifacts', `Prepared ${artifactCount} launch artifacts`, 'success')

    repoFiles = readRepoFiles(workDir)
    projectType = detectProjectType(repoFiles.map((file) => ({ filePath: file.filePath })))
    emitLog(emit, runId, 'DeliveryGuard', `Running final delivery guard for ${projectType} project...`)
    const deliveryGuard = runDeliveryGuard(repoFiles)
    if (deliveryGuard.fixes.length > 0) {
      updateModifiedFiles(modifiedFiles, deliveryGuard.fixes, workDir)
      emitLog(emit, runId, 'DeliveryGuard', `Applied ${deliveryGuard.fixes.length} deterministic delivery repair${deliveryGuard.fixes.length === 1 ? '' : 's'}`, 'success')
      repoFiles = readRepoFiles(workDir)
      projectType = detectProjectType(repoFiles.map((file) => ({ filePath: file.filePath })))
    }

    if (deliveryGuard.ready) {
      emitLog(emit, runId, 'DeliveryGuard', deliveryGuard.summary, 'success')
    } else {
      emitLog(emit, runId, 'DeliveryGuard', deliveryGuard.summary, 'warn')
      for (const blocker of deliveryGuard.blockers) {
        emitLog(emit, runId, 'DeliveryGuard', blocker, 'warn')
      }
    }
    for (const warning of deliveryGuard.warnings) {
      emitLog(emit, runId, 'DeliveryGuard', warning, 'warn')
    }

    const cycleValidation = await validateFiles(
      userId,
      repoFiles.map((file) => ({ path: file.filePath, content: file.content })),
    )
    validationPassed = cycleValidation.passed
    validationIssues = cycleValidation.issues.map((issue) => `${issue.phase}: ${issue.description}`)
    errors = validationPassed
      ? []
      : validationIssues.map((issue) => `Validation: ${issue.slice(0, 500)}`)
    if (!deliveryGuard.ready) {
      errors.push(...deliveryGuard.blockers.map((blocker) => `Delivery Guard: ${blocker.slice(0, 500)}`))
    }
    lintPassed = true
    testsPassed = true

    if (!validationPassed) {
      emitLog(emit, runId, 'Validate', `Preview gate found ${validationIssues.length} remaining validation issue(s)`, 'warn')
      for (const issue of validationIssues) {
        emitLog(emit, runId, 'Validate', issue, 'warn')
      }
    }

    emitLog(emit, runId, 'Launcher', `Evaluating launch readiness for ${projectType} project...`)
    const launchAssessment = await evaluateLaunchReadiness({
      userId,
      files: repoFiles,
      projectType,
      conventions,
    })

    if (launchAssessment.ready) {
      emitLog(
        emit,
        runId,
        'Launcher',
        `Launch-ready via ${launchAssessment.framework ?? projectType}${launchAssessment.startCommand ? ` using "${launchAssessment.startCommand}"` : ''}`,
        'success',
      )
    } else {
      emitLog(emit, runId, 'Launcher', launchAssessment.summary || 'Launcher agent found startup blockers', 'warn')
      for (const blocker of launchAssessment.blockers) {
        emitLog(emit, runId, 'Launcher', blocker, 'warn')
      }

      if (cycle < cycleLimit) {
        const finished = await runLaunchFinisherCycle({
          userId,
          runId,
          workDir,
          modifiedFiles,
          repoFiles,
          launchAssessment,
          emit,
          cycle: cycle + 1,
          cycleLimit,
          language: conventions.language,
          framework: conventions.framework ?? undefined,
        })

        if (finished) {
          continue
        }
      }

      errors.push(...launchAssessment.blockers.map((blocker) => `Launch: ${blocker.slice(0, 500)}`))
    }

    emitLog(emit, runId, 'Verify', `Running final build verification for ${projectType} project...`)
    
    // --- FORGE INJECTION: Dependency Pinning ---
    try {
      
      
      const pkgPath = path.join(workDir, 'package.json');
      const rawPkg = await fsP.readFile(pkgPath, 'utf8');
      const safePkg = DependencyPinner.pin(rawPkg);
      await fsP.writeFile(pkgPath, safePkg, 'utf8');
      emitLog(emit, runId, 'Verify', 'Locked dependencies to Known-Good versions.');
    } catch(e) {
      // Ignore if no package.json exists yet
    }
    
    
    // --- TIME-TRAVEL: Commit AI's attempt before verifying ---
    try {
      const currentCycle = typeof cycle !== 'undefined' ? cycle : 1;
      GitTracker.commit(workDir, `feat(ai): agent generated code (Cycle ${currentCycle})`);
    } catch(e) {}

    const buildResult = await BuildVerifier.verify(workDir)
    
    // --- TIME-TRAVEL: Commit the self-heal trigger if it failed ---
    if (!buildResult.success && buildResult.errors.length > 0) {
      try {
        const errorPreview = buildResult.errors[0].slice(0, 60).replace(/\n/g, ' ');
        GitTracker.commit(workDir, `fix(self-heal): verification failed - ${errorPreview}`);
      } catch(e) {}
    }


    // --- FORGE INJECTION: Database Telemetry ---
    try {
      await prisma.pipelineRun.create({
        data: {
          taskName: projectType || 'unknown-project',
          targetAgent: 'Pipeline Runner',
          success: buildResult.success,
          iterations: typeof cycle !== 'undefined' ? cycle : 1
        }
      });
    } catch(e) {
      console.warn('Telemetry error:', e);
    }
  
    if (buildResult.success) {
      emitLog(emit, runId, 'Verify', 'Build verification passed', 'success')
    } else {
      errors.push(...buildResult.errors.map((error) => `Build: ${error.slice(0, 500)}`))
      emitLog(emit, runId, 'Verify', 'Build verification failed', 'error')
    }

    if (buildResult.warnings.length > 0) {
      for (const warning of buildResult.warnings) {
        emitLog(emit, runId, 'Verify', warning, 'warn')
      }
    }

    const { lintCommand, testCommand } = inferNodeCommands(workDir, conventions)

    if (lintCommand) {
      try {
        emitLog(emit, runId, 'Verify', `Running lint: ${lintCommand}`)
        execSync(lintCommand, { cwd: workDir, timeout: 60000, stdio: 'pipe' })
        emitLog(emit, runId, 'Verify', 'Lint passed', 'success')
      } catch (err) {
        lintPassed = false
        const msg = err instanceof Error ? err.message : 'Lint failed'
        errors.push(`Lint: ${msg.slice(0, 500)}`)
        emitLog(emit, runId, 'Verify', 'Lint failed', 'error')
      }
    } else {
      emitLog(emit, runId, 'Verify', 'No lint command detected in the final artifact', 'warn')
    }

    if (testCommand) {
      try {
        emitLog(emit, runId, 'Verify', `Running tests: ${testCommand}`)
        execSync(testCommand, { cwd: workDir, timeout: 120000, stdio: 'pipe' })
        emitLog(emit, runId, 'Verify', 'Tests passed', 'success')
      } catch (err) {
        testsPassed = false
        const msg = err instanceof Error ? err.message : 'Tests failed'
        errors.push(`Tests: ${msg.slice(0, 500)}`)
        emitLog(emit, runId, 'Verify', 'Tests failed', 'error')
      }
    } else {
      emitLog(emit, runId, 'Verify', 'No test command detected in the final artifact', 'warn')
    }

    const shouldVerifyPreview = projectType === 'node' || projectType === 'static'
    if (shouldVerifyPreview) {
      const dockerAvailability = DockerSandbox.getAvailability()
      let sandboxResult: Awaited<ReturnType<typeof DockerSandbox.verify>> | null = null

      if (dockerAvailability.available && buildResult.success && lintPassed && testsPassed) {
        emitLog(emit, runId, 'Preview', 'Running Docker sandbox preview verification...', 'info')
        const sandboxFiles = readRepoFiles(workDir).map((file) => ({ filePath: file.filePath, content: file.content }))
        sandboxResult = await DockerSandbox.verify(sandboxFiles)
        emitLog(
          emit,
          runId,
          'Preview',
          sandboxResult.success ? 'Sandbox install/build/startup check passed' : `Sandbox ${sandboxResult.phase} check failed`,
          sandboxResult.success ? 'success' : 'warn',
        )
      } else if (!dockerAvailability.available) {
        emitLog(emit, runId, 'Preview', dockerAvailability.reason || 'Docker sandbox unavailable', 'warn')
      }

      const previewAssessment = await evaluatePreviewReadiness({
        userId,
        files: readRepoFiles(workDir),
        projectType,
        launchAssessment,
        validationIssues,
        buildResult,
        lintPassed,
        testsPassed,
        sandboxAvailable: dockerAvailability.available,
        sandboxReason: dockerAvailability.reason,
        sandboxResult,
      })

      if (previewAssessment.ready) {
        emitLog(emit, runId, 'Preview', previewAssessment.summary, 'success')
      } else {
        emitLog(emit, runId, 'Preview', previewAssessment.summary || 'Preview readiness failed', 'warn')
        for (const blocker of previewAssessment.blockers) {
          emitLog(emit, runId, 'Preview', blocker, 'warn')
        }

        if (cycle < cycleLimit) {
          const finished = await runLaunchFinisherCycle({
            userId,
            runId,
            workDir,
            modifiedFiles,
            repoFiles: readRepoFiles(workDir),
            launchAssessment: mergePreviewIntoLaunchAssessment(launchAssessment, previewAssessment),
            emit,
            cycle: cycle + 1,
            cycleLimit,
            language: conventions.language,
            framework: conventions.framework ?? undefined,
          })

          if (finished) {
            continue
          }
        }

        errors.push(...previewAssessment.blockers.map((blocker) => `Preview: ${blocker.slice(0, 500)}`))
      }

      for (const warning of previewAssessment.warnings) {
        emitLog(emit, runId, 'Preview', warning, 'warn')
      }
    }

    finalFiles = Array.from(modifiedFiles.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => ({ path, content }))

    if (errors.length === 0) {
      break
    }

    if (cycle === cycleLimit) {
      emitLog(emit, runId, 'AutoFix', `Auto-fix limit reached after ${cycleLimit} cycle(s); surfacing remaining errors for manual review`, 'warn')
      break
    }

    const repaired = await runBuildAutoFixCycle({
      userId,
      runId,
      workDir,
      modifiedFiles,
      errors,
      emit,
      cycle: cycle + 1,
      cycleLimit,
      language: conventions.language,
      framework: conventions.framework ?? undefined,
    })

    if (!repaired) {
      emitLog(emit, runId, 'AutoFix', 'Auto-fix could not produce an actionable repair plan', 'warn')
      break
    }
  }

  // 10. Save the verified artifact set that will actually be published.
  await saveForgeRunDiff(runId, {
    files: finalFiles,
    lintPassed,
    testsPassed,
    errors,
  })

  // 11. Emit diff event
  emit({
    type: 'diff',
    files: finalFiles,
    lintPassed,
    testsPassed,
    errors,
  })

  emit({
    type: 'status',
    status: errors.length === 0 ? 'awaiting_approval' : 'failed',
    stage: 'code',
  })
}
