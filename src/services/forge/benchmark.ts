import { extractFilesFromArtifact } from '../file-manager'
import { CompletenessPass, detectProjectType } from '../completeness-pass'
import { DependencyResolver } from '../dependency-resolver'
import { TestGenerator } from '../test-generator'
import { DockerfileGenerator } from '../dockerfile-generator'
import { SecretScanner } from '../secret-scanner'
import { normalizeImplementationManifest } from './agents/prompt-agent'
import { finalizePreviewAssessment } from './agents/preview-agent'
import { validateImplementationManifestContract } from './types/contracts'
import { preparePreviewFiles, runPreviewPreflight } from '../preview-preflight'
import { detectPreviewRuntimeBlocker } from '../preview-runtime-guard'
import { detectDependencyConflict } from '../verification-gate'
import { runDeliveryGuard } from './agents/delivery-guard-agent'
import benchmarkFixtures from '../../../benchmarks/forge/cases.json'

export interface ForgeBenchmarkCaseResult {
  id: string
  category: string
  name: string
  passed: boolean
  score: number
  details: string[]
}

export interface ForgeBenchmarkSummary {
  totalCases: number
  passedCases: number
  failedCases: number
  passRate: number
  avgScore: number
  byCategory: Array<{
    category: string
    total: number
    passed: number
    passRate: number
    avgScore: number
  }>
  cases: ForgeBenchmarkCaseResult[]
}

interface ForgeBenchmarkCase {
  id: string
  category: string
  name: string
  run: () => ForgeBenchmarkCaseResult
}

function buildResult(
  id: string,
  category: string,
  name: string,
  checks: Array<{ ok: boolean; detail: string }>,
): ForgeBenchmarkCaseResult {
  const passedChecks = checks.filter((check) => check.ok).length
  const score = Math.round((passedChecks / checks.length) * 100)
  return {
    id,
    category,
    name,
    passed: passedChecks === checks.length,
    score,
    details: checks.map((check) => `${check.ok ? 'PASS' : 'FAIL'}: ${check.detail}`),
  }
}

const BENCHMARK_CASES: ForgeBenchmarkCase[] = [
  {
    id: 'greenfield-incomplete-react',
    category: 'artifact-recovery',
    name: 'Completeness pass recovers an incomplete React app into a previewable scaffold',
    run: () => {
      const extracted = extractFilesFromArtifact(benchmarkFixtures.incompleteReactOutput)
      const projectType = detectProjectType(extracted)
      const completeness = CompletenessPass.run(extracted, projectType)
      const allFiles = [...extracted, ...completeness.files]
      const filePaths = new Set(allFiles.map((file) => file.filePath))
      const pkgFile = allFiles.find((file) => file.filePath === 'package.json')
      const pkg = pkgFile ? JSON.parse(pkgFile.content) as { scripts?: Record<string, string> } : null

      return buildResult(
        'greenfield-incomplete-react',
        'artifact-recovery',
        'Completeness pass recovers an incomplete React app into a previewable scaffold',
        [
          { ok: projectType === 'node', detail: 'Project type inferred as node from TSX files' },
          { ok: filePaths.has('package.json'), detail: 'package.json exists after completeness pass' },
          { ok: filePaths.has('src/main.tsx'), detail: 'main entrypoint exists after completeness pass' },
          { ok: filePaths.has('index.html'), detail: 'index.html exists after completeness pass' },
          { ok: pkg?.scripts?.dev === 'vite', detail: 'Dev script normalized to vite' },
        ],
      )
    },
  },
  {
    id: 'node-script-normalization',
    category: 'launch-correctness',
    name: 'Node server package scripts are repaired away from stale nodemon JS entrypoints',
    run: () => {
      const files = benchmarkFixtures.nodeScriptNormalizationFiles
      const result = CompletenessPass.run(files, 'node')
      const pkgUpdate = result.files.find((file) => file.filePath === 'package.json')
      const pkg = pkgUpdate ? JSON.parse(pkgUpdate.content) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> } : null

      return buildResult(
        'node-script-normalization',
        'launch-correctness',
        'Node server package scripts are repaired away from stale nodemon JS entrypoints',
        [
          { ok: pkg?.scripts?.dev === 'tsx watch src/index.ts', detail: 'Dev script points at tsx watch src/index.ts' },
          { ok: pkg?.scripts?.build === 'tsc', detail: 'Build script points at tsc' },
          { ok: pkg?.scripts?.start === 'node dist/index.js', detail: 'Start script points at dist output' },
          { ok: pkg?.devDependencies?.tsx === '^4.19.2', detail: 'tsx dependency added for TypeScript server runtime' },
        ],
      )
    },
  },
  {
    id: 'manifest-contract-ordering',
    category: 'planning',
    name: 'Manifest normalization preserves dependency integrity and topological order',
    run: () => {
      const manifest = normalizeImplementationManifest(benchmarkFixtures.manifestOrdering)
      const validated = validateImplementationManifestContract(manifest)

      return buildResult(
        'manifest-contract-ordering',
        'planning',
        'Manifest normalization preserves dependency integrity and topological order',
        [
          { ok: validated.files[0]?.path === 'src/types.ts', detail: 'Types file sorted ahead of dependent files' },
          { ok: validated.files[1]?.path === 'src/service.ts', detail: 'Service file sorted between types and app' },
          { ok: validated.files[2]?.path === 'src/app.ts', detail: 'Entry file sorted last' },
        ],
      )
    },
  },
  {
    id: 'preview-false-ready-guard',
    category: 'preview-readiness',
    name: 'Preview readiness blocks false-positive launch claims when startup fails',
    run: () => {
      const assessment = finalizePreviewAssessment({
        files: [
          {
            filePath: 'package.json',
            content: JSON.stringify({
              scripts: {
                dev: 'vite',
              },
              dependencies: {
                react: '^18.3.1',
                'react-dom': '^18.3.1',
              },
              devDependencies: {
                vite: '^5.4.14',
                '@vitejs/plugin-react': '^4.3.4',
              },
            }),
          },
          {
            filePath: 'index.html',
            content: '<!doctype html><html><body><div id="root"></div></body></html>',
          },
          {
            filePath: 'src/main.tsx',
            content: 'import React from "react";',
          },
          {
            filePath: 'vite.config.ts',
            content: 'export default {}',
          },
        ],
        projectType: 'node',
        launchAssessment: {
          projectType: 'node',
          framework: 'vite-react',
          installCommand: 'npm install',
          startCommand: 'npm run dev',
          expectedPort: 5173,
          ready: true,
          blockers: [],
          missingPackages: [],
          summary: 'Static analysis looked good',
        },
        validationIssues: [],
        buildResult: {
          success: true,
          installOutput: '',
          buildOutput: '',
          errors: [],
          warnings: [],
          durationMs: 10,
        },
        lintPassed: true,
        testsPassed: true,
        sandboxAvailable: true,
        sandboxResult: {
          success: false,
          phase: 'start',
          stdout: '',
          stderr: 'app crashed immediately',
          exitCode: 1,
        },
      })

      return buildResult(
        'preview-false-ready-guard',
        'preview-readiness',
        'Preview readiness blocks false-positive launch claims when startup fails',
        [
          { ok: assessment.ready === false, detail: 'Preview marked not ready when sandbox startup fails' },
          { ok: assessment.blockers.some((blocker) => blocker.includes('Preview sandbox start failed')), detail: 'Preview blockers mention sandbox startup failure' },
          { ok: assessment.startCommand === 'npm run dev', detail: 'Preview assessment preserves launch command context' },
        ],
      )
    },
  },
  {
    id: 'vite-package-normalization',
    category: 'launch-correctness',
    name: 'Existing Vite projects are normalized into compatible React and tooling versions',
    run: () => {
      const files = benchmarkFixtures.viteNormalizationFiles
      const result = CompletenessPass.run(files, 'node')
      const pkgUpdate = result.files.find((file) => file.filePath === 'package.json')
      const pkg = pkgUpdate ? JSON.parse(pkgUpdate.content) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        scripts?: Record<string, string>
      } : null

      return buildResult(
        'vite-package-normalization',
        'launch-correctness',
        'Existing Vite projects are normalized into compatible React and tooling versions',
        [
          { ok: pkg?.dependencies?.react === '^18.3.1', detail: 'React version aligned to supported runtime' },
          { ok: pkg?.devDependencies?.vite === '^5.4.14', detail: 'Vite version aligned to supported toolchain' },
          { ok: pkg?.devDependencies?.['@vitejs/plugin-react'] === '^4.3.4', detail: 'Vite React plugin aligned to supported toolchain' },
          { ok: pkg?.scripts?.dev === 'vite', detail: 'Dev script normalized to vite' },
        ],
      )
    },
  },
  {
    id: 'parcel-script-normalization',
    category: 'launch-correctness',
    name: 'Legacy Parcel launch scripts are normalized into the supported Vite toolchain',
    run: () => {
      const files = benchmarkFixtures.parcelNormalizationFiles
      const result = CompletenessPass.run(files, 'node')
      const pkgUpdate = result.files.find((file) => file.filePath === 'package.json')
      const pkg = pkgUpdate ? JSON.parse(pkgUpdate.content) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        scripts?: Record<string, string>
      } : null

      return buildResult(
        'parcel-script-normalization',
        'launch-correctness',
        'Legacy Parcel launch scripts are normalized into the supported Vite toolchain',
        [
          { ok: pkg?.dependencies?.parcel === undefined, detail: 'Legacy parcel dependency removed from runtime dependencies' },
          { ok: pkg?.scripts?.dev === 'vite', detail: 'Dev script rewritten to vite' },
          { ok: pkg?.scripts?.build === 'vite build', detail: 'Build script rewritten to vite build' },
          { ok: pkg?.scripts?.preview === 'vite preview', detail: 'Preview script rewritten to vite preview' },
        ],
      )
    },
  },
  {
    id: 'artifact-tooling-health',
    category: 'artifact-quality',
    name: 'Recovered project can derive dependencies, tests, docker config, and stays secret-clean',
    run: () => {
      const extracted = extractFilesFromArtifact(benchmarkFixtures.incompleteReactOutput)
      const completeness = CompletenessPass.run(extracted, detectProjectType(extracted))
      const allFiles = [...extracted, ...completeness.files]
      const projectType = detectProjectType(allFiles)
      const deps = DependencyResolver.resolve(allFiles, projectType)
      const tests = TestGenerator.scaffold(allFiles, projectType)
      const docker = DockerfileGenerator.generate(allFiles, { projectName: 'benchmark-app', projectType })
      const secrets = SecretScanner.scan(allFiles)

      return buildResult(
        'artifact-tooling-health',
        'artifact-quality',
        'Recovered project can derive dependencies, tests, docker config, and stays secret-clean',
        [
          { ok: deps.dependencies.length > 0, detail: 'Dependency resolver finds at least one runtime dependency' },
          { ok: tests.framework === 'vitest', detail: 'Test scaffold chooses vitest for node case' },
          { ok: docker.files.some((file) => file.filePath === 'Dockerfile'), detail: 'Dockerfile generated for recovered project' },
          { ok: secrets.clean === true, detail: 'Recovered files do not trip the secret scanner' },
        ],
      )
    },
  },
  {
    id: 'preview-entry-import-repair',
    category: 'preview-readiness',
    name: 'Preview prep repairs broken main-entry imports before runtime launch',
    run: () => {
      const prepared = preparePreviewFiles(benchmarkFixtures.previewImportRepairFiles)
      const mainEntry = prepared.files.find((file) => file.filePath === 'src/main.tsx')
      const preflight = runPreviewPreflight(prepared.files)

      return buildResult(
        'preview-entry-import-repair',
        'preview-readiness',
        'Preview prep repairs broken main-entry imports before runtime launch',
        [
          { ok: (mainEntry?.content || '').includes("./app"), detail: 'Main entry import rewritten toward the real app component' },
          { ok: prepared.warnings.some((warning) => warning.includes('Preview repaired main entry imports')), detail: 'Repair warning emitted for rewritten main entry imports' },
          { ok: preflight.ok === true, detail: 'Preview preflight passes after import repair' },
        ],
      )
    },
  },
  {
    id: 'preview-runtime-log-guard',
    category: 'preview-readiness',
    name: 'Runtime log guard turns preview white-screen failures into explicit blockers',
    run: () => {
      const blocker = detectPreviewRuntimeBlocker({
        error: null,
        logs: benchmarkFixtures.previewRuntimeLog,
      })

      return buildResult(
        'preview-runtime-log-guard',
        'preview-readiness',
        'Runtime log guard turns preview white-screen failures into explicit blockers',
        [
          { ok: blocker !== null, detail: 'Runtime blocker detected from preview worker logs' },
          { ok: (blocker || '').includes('broken import') || (blocker || '').includes('missing'), detail: 'Runtime blocker explains the import/runtime failure clearly' },
        ],
      )
    },
  },
  {
    id: 'verification-dependency-conflict-gate',
    category: 'verification-gating',
    name: 'Verification gate classifies dependency conflicts before broken apps are promoted',
    run: () => {
      const blocker = detectDependencyConflict(benchmarkFixtures.verificationDependencyConflictLog)

      return buildResult(
        'verification-dependency-conflict-gate',
        'verification-gating',
        'Verification gate classifies dependency conflicts before broken apps are promoted',
        [
          { ok: blocker !== null, detail: 'Dependency conflict classified from verifier output' },
          { ok: (blocker || '').includes('compatible dependency versions') || (blocker || '').includes('peer dependency conflict'), detail: 'Dependency conflict explanation is explicit enough to route back through repair' },
        ],
      )
    },
  },
  {
    id: 'router-mismatch-delivery-guard',
    category: 'preview-readiness',
    name: 'Repo-backed router mismatches are blocked before preview launch',
    run: () => {
      const result = runDeliveryGuard(benchmarkFixtures.routerMismatchFiles)

      return buildResult(
        'router-mismatch-delivery-guard',
        'preview-readiness',
        'Repo-backed router mismatches are blocked before preview launch',
        [
          { ok: result.ready === false, detail: 'Delivery guard marks the repo-backed router mismatch as not ready' },
          { ok: result.blockers.some((blocker) => blocker.includes('Switch')), detail: 'Delivery guard flags legacy Switch usage' },
          { ok: result.blockers.some((blocker) => blocker.includes('component=')), detail: 'Delivery guard flags legacy component= route usage' },
        ],
      )
    },
  },
  {
    id: 'weekly-commit-module-end-to-end',
    category: 'end-to-end',
    name: 'End-to-end recovery turns a sparse weekly commit module artifact into a previewable project',
    run: () => {
      const extracted = extractFilesFromArtifact(benchmarkFixtures.weeklyCommitModuleOutput)
      const detectedProjectType = detectProjectType(extracted)
      const completeness = CompletenessPass.run(extracted, detectedProjectType)
      const recoveredFiles = [...extracted, ...completeness.files].map((file) => ({
        filePath: file.filePath,
        content: file.content,
      }))
      const prepared = preparePreviewFiles(recoveredFiles)
      const preflight = runPreviewPreflight(prepared.files)
      const finalProjectType = detectProjectType(prepared.files)
      const deps = DependencyResolver.resolve(prepared.files, finalProjectType)
      const tests = TestGenerator.scaffold(prepared.files, finalProjectType)
      const docker = DockerfileGenerator.generate(prepared.files, {
        projectName: 'weekly-commit-module',
        projectType: finalProjectType,
      })

      return buildResult(
        'weekly-commit-module-end-to-end',
        'end-to-end',
        'End-to-end recovery turns a sparse weekly commit module artifact into a previewable project',
        [
          { ok: detectedProjectType === 'node', detail: 'Sparse artifact is classified as a node project' },
          { ok: prepared.files.some((file) => file.filePath === 'package.json'), detail: 'Recovered project includes package.json' },
          { ok: prepared.files.some((file) => file.filePath === 'src/main.tsx'), detail: 'Recovered project includes a browser entrypoint' },
          { ok: preflight.ok === true, detail: 'Recovered project passes preview preflight' },
          { ok: deps.dependencies.some((dep) => dep.packageName === 'react'), detail: 'Recovered project resolves runtime dependencies correctly' },
          { ok: tests.framework === 'vitest', detail: 'Recovered project selects the expected test harness' },
          { ok: docker.files.some((file) => file.filePath === 'Dockerfile'), detail: 'Recovered project can emit deployable Docker scaffolding' },
        ],
      )
    },
  },
  {
    id: 'engine-project-preservation',
    category: 'engine-compatibility',
    name: 'Engine projects keep engine structure and do not get forced into node scaffolding',
    run: () => {
      const files = benchmarkFixtures.godotProjectFiles
      const projectType = detectProjectType(files)
      const result = CompletenessPass.run(files, projectType)
      const generatedPaths = new Set(result.files.map((file) => file.filePath))

      return buildResult(
        'engine-project-preservation',
        'engine-compatibility',
        'Engine projects keep engine structure and do not get forced into node scaffolding',
        [
          { ok: projectType === 'godot', detail: 'Godot project detected before node inference' },
          { ok: !generatedPaths.has('package.json'), detail: 'No package.json scaffolded for engine-only project' },
          { ok: !generatedPaths.has('vite.config.ts'), detail: 'No Vite config scaffolded for engine-only project' },
          { ok: generatedPaths.has('.gitignore'), detail: 'General repo hygiene file can still be generated' },
        ],
      )
    },
  },
]

export function runForgeBenchmarkSuite(): ForgeBenchmarkSummary {
  const cases = BENCHMARK_CASES.map((testCase) => testCase.run())
  const passedCases = cases.filter((testCase) => testCase.passed).length

  const byCategoryMap = new Map<string, ForgeBenchmarkCaseResult[]>()
  for (const testCase of cases) {
    const existing = byCategoryMap.get(testCase.category) || []
    existing.push(testCase)
    byCategoryMap.set(testCase.category, existing)
  }

  const byCategory = Array.from(byCategoryMap.entries()).map(([category, entries]) => {
    const passed = entries.filter((entry) => entry.passed).length
    const avgScore = Math.round(entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length)
    return {
      category,
      total: entries.length,
      passed,
      passRate: Math.round((passed / entries.length) * 100),
      avgScore,
    }
  }).sort((left, right) => left.category.localeCompare(right.category))

  return {
    totalCases: cases.length,
    passedCases,
    failedCases: cases.length - passedCases,
    passRate: Math.round((passedCases / cases.length) * 100),
    avgScore: Math.round(cases.reduce((sum, testCase) => sum + testCase.score, 0) / cases.length),
    byCategory,
    cases,
  }
}
