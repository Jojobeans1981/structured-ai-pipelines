import { prisma } from '@/src/lib/prisma'
import type {
  ForgeRun,
  ForgeRunLog,
  ForgeRunDiff,
  ForgeRunDiagnosis,
  ForgeRunResult,
  ForgeLessonLearned,
  Prisma,
} from '@prisma/client'

export type {
  ForgeRun,
  ForgeRunLog,
  ForgeRunDiff,
  ForgeRunDiagnosis,
  ForgeRunResult,
  ForgeLessonLearned,
}

export async function createForgeRun(userId: string, data: {
  mode: string
  repoUrl: string
  specContent?: string
  specFilename?: string
  bugDescription?: string
  branchName?: string
  continuous?: boolean
}): Promise<ForgeRun> {
  return prisma.forgeRun.create({
    data: {
      userId,
      mode: data.mode,
      repoUrl: data.repoUrl,
      specContent: data.specContent,
      specFilename: data.specFilename,
      bugDescription: data.bugDescription,
      branchName: data.branchName,
      continuous: data.continuous ?? false,
    },
  })
}

export async function getForgeRun(id: string): Promise<ForgeRun | null> {
  return prisma.forgeRun.findUnique({ where: { id } })
}

export async function getForgeRunWithDetails(id: string): Promise<{
  run: ForgeRun
  logs: ForgeRunLog[]
  diff: ForgeRunDiff | null
  diagnosis: ForgeRunDiagnosis | null
  result: ForgeRunResult | null
} | null> {
  const run = await prisma.forgeRun.findUnique({
    where: { id },
    include: {
      logs: { orderBy: { createdAt: 'asc' } },
      diff: true,
      diagnosis: true,
      result: true,
    },
  })

  if (!run) return null

  return {
    run,
    logs: run.logs,
    diff: run.diff,
    diagnosis: run.diagnosis,
    result: run.result,
  }
}

export async function listForgeRuns(userId: string): Promise<ForgeRun[]> {
  return prisma.forgeRun.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function updateForgeRun(id: string, data: Partial<{
  status: string
  stage: string | null
  prdTitle: string
  prdSummary: string
  stageData: Prisma.InputJsonValue
  error: string
  completedAt: string
  branchName: string
}>): Promise<ForgeRun> {
  return prisma.forgeRun.update({
    where: { id },
    data,
  })
}

export async function claimForgeRun(
  id: string,
  userId: string,
  expected: { status: string; stage?: string | null },
  next: { status: string; stage?: string | null },
): Promise<boolean> {
  const result = await prisma.forgeRun.updateMany({
    where: {
      id,
      userId,
      status: expected.status,
      ...(expected.stage !== undefined ? { stage: expected.stage } : {}),
    },
    data: next,
  })

  return result.count === 1
}

export async function saveForgeRunStageData(runId: string, stageData: unknown): Promise<ForgeRun> {
  return updateForgeRun(runId, { stageData: stageData as Prisma.InputJsonValue })
}

export async function getForgeRunStageData<T>(runId: string): Promise<T | null> {
  const run = await prisma.forgeRun.findUnique({
    where: { id: runId },
    select: { stageData: true },
  })

  return (run?.stageData as T | null) ?? null
}

export async function addForgeRunLog(runId: string, data: {
  step: string
  level: string
  message: string
}): Promise<ForgeRunLog> {
  return prisma.forgeRunLog.create({
    data: {
      runId,
      step: data.step,
      level: data.level,
      message: data.message,
    },
  })
}

export async function saveForgeRunDiff(runId: string, data: {
  files: Array<{ path: string; content: string }>
  lintPassed: boolean
  testsPassed: boolean
  errors: string[]
}): Promise<ForgeRunDiff> {
  return prisma.forgeRunDiff.upsert({
    where: { runId },
    create: {
      runId,
      files: data.files,
      lintPassed: data.lintPassed,
      testsPassed: data.testsPassed,
      errors: data.errors,
    },
    update: {
      files: data.files,
      lintPassed: data.lintPassed,
      testsPassed: data.testsPassed,
      errors: data.errors,
    },
  })
}

export async function saveForgeRunDiagnosis(runId: string, data: {
  rootCause: string
  affectedFiles: string[]
  fixPlan: Array<{ file: string; action: string; description: string }>
}): Promise<ForgeRunDiagnosis> {
  return prisma.forgeRunDiagnosis.create({
    data: {
      runId,
      rootCause: data.rootCause,
      affectedFiles: data.affectedFiles,
      fixPlan: data.fixPlan,
    },
  })
}

export async function saveForgeRunResult(runId: string, data: {
  mrUrl: string
  mrIid: number
  branch: string
  title: string
}): Promise<ForgeRunResult> {
  return prisma.forgeRunResult.create({
    data: {
      runId,
      mrUrl: data.mrUrl,
      mrIid: data.mrIid,
      branch: data.branch,
      title: data.title,
    },
  })
}

export async function addForgeLessonLearned(data: {
  runId?: string
  phase: number
  phaseName: string
  error: string
  fix: string
  rootCause: string
  preventionRule: string
  language?: string
  framework?: string
}): Promise<ForgeLessonLearned> {
  return prisma.forgeLessonLearned.create({
    data: {
      runId: data.runId,
      phase: data.phase,
      phaseName: data.phaseName,
      error: data.error,
      fix: data.fix,
      rootCause: data.rootCause,
      preventionRule: data.preventionRule,
      language: data.language,
      framework: data.framework,
    },
  })
}

export async function getForgeLessonsForContext(
  language?: string,
  framework?: string,
): Promise<ForgeLessonLearned[]> {
  const where: Record<string, unknown> = {}
  if (language) where.language = language
  if (framework) where.framework = framework

  return prisma.forgeLessonLearned.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}
