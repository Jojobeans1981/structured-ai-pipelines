import { describe, expect, it } from 'vitest'
import {
  FORGE_STEP_CONTRACTS,
  ForgeSpecHarnessSchema,
  ForgeStepContractsSchema,
  LaunchAssessmentSchema,
  PreviewAssessmentSchema,
  ValidationResultSchema,
  validateImplementationManifestContract,
} from '../src/services/forge/types/contracts'

describe('Forge step contracts', () => {
  it('defines a valid contract record for every tracked Forge step', () => {
    const parsed = ForgeStepContractsSchema.parse(FORGE_STEP_CONTRACTS)
    expect(parsed.length).toBeGreaterThanOrEqual(7)
  })

  it('accepts a valid harness snapshot spanning the critical preview path', () => {
    const harness = ForgeSpecHarnessSchema.parse({
      prd: {
        title: 'Todo App',
        summary: 'Build a previewable todo app',
        fullText: 'Create a working todo application with a bootable preview.',
      },
      manifest: {
        files: [
          { path: 'src/types.ts', description: 'Shared types', dependencies: [] },
          { path: 'src/app.ts', description: 'App entry point', dependencies: ['src/types.ts'] },
        ],
      },
      validation: {
        passed: true,
        issues: [],
        fixes: [],
      },
      launch: {
        projectType: 'node',
        framework: 'vite-react',
        installCommand: 'npm install',
        startCommand: 'npm run dev',
        expectedPort: 5173,
        ready: true,
        blockers: [],
        missingPackages: [],
        summary: 'Launch contract satisfied',
      },
      preview: {
        ready: true,
        summary: 'Preview contract satisfied',
        blockers: [],
        warnings: [],
        startCommand: 'npm run dev',
        expectedPort: 5173,
      },
      fixPlan: {
        steps: [{ file: 'package.json', action: 'modify', description: 'Align scripts' }],
        summary: 'Repair startup scripts',
      },
    })

    expect(harness.preview?.ready).toBe(true)
  })

  it('rejects a manifest with missing dependency targets', () => {
    expect(() =>
      validateImplementationManifestContract({
        files: [
          { path: 'src/app.ts', description: 'Entry point', dependencies: ['src/missing.ts'] },
        ],
      })
    ).toThrow(/missing/i)
  })

  it('rejects a passing validation payload that still contains issues', () => {
    expect(() =>
      ValidationResultSchema.parse({
        passed: true,
        issues: [{ phase: 'Structure', description: 'package.json missing' }],
        fixes: [],
      })
    ).toThrow(/passing validation result/i)
  })

  it('rejects a non-ready launch assessment with no blockers', () => {
    expect(() =>
      LaunchAssessmentSchema.parse({
        projectType: 'node',
        framework: 'vite-react',
        installCommand: 'npm install',
        startCommand: 'npm run dev',
        expectedPort: 5173,
        ready: false,
        blockers: [],
        missingPackages: [],
        summary: 'Not ready',
      })
    ).toThrow(/blocker/i)
  })

  it('rejects a non-ready preview assessment with no blockers', () => {
    expect(() =>
      PreviewAssessmentSchema.parse({
        ready: false,
        summary: 'Preview failed',
        blockers: [],
        warnings: [],
        startCommand: 'npm run dev',
        expectedPort: 5173,
      })
    ).toThrow(/blocker/i)
  })
})
