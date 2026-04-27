export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getForgeSessionOrDemo } from '@/src/lib/auth-helpers'
import { z } from 'zod'
import { createForgeRun, listForgeRuns } from '@/src/services/forge/db'
import { extractTextFromFile } from '@/src/services/forge/utils/markdown'
import { validateGitLabRepoUrl } from '@/src/services/forge/utils/repo'

const GitLabRepoUrlSchema = z.string().transform((value, ctx) => {
  try {
    return validateGitLabRepoUrl(value)
  } catch (err) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err instanceof Error ? err.message : 'Invalid GitLab repo URL',
    })
    return z.NEVER
  }
})

const BuildJsonSchema = z.object({
  mode: z.literal('build'),
  repoUrl: GitLabRepoUrlSchema,
  specContent: z.string().min(1),
  specFilename: z.string().optional(),
  branchName: z.string().optional(),
  continuous: z.boolean().optional(),
})

const DebugJsonSchema = z.object({
  mode: z.literal('debug'),
  repoUrl: GitLabRepoUrlSchema,
  bugDescription: z.string().min(1),
  branchName: z.string().optional(),
  continuous: z.boolean().optional(),
})

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getForgeSessionOrDemo()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const repoUrl = formData.get('repoUrl') as string
      const branchName = formData.get('branchName') as string | null
      const specFile = formData.get('specFile') as File | null
      const continuous = formData.get('continuous') === 'true'

      const repoResult = GitLabRepoUrlSchema.safeParse(repoUrl)
      if (!repoUrl || !specFile) {
        return NextResponse.json({ error: 'repoUrl and specFile are required' }, { status: 400 })
      }

      if (!repoResult.success) {
        return NextResponse.json({ error: repoResult.error.issues[0]?.message ?? 'Invalid GitLab repo URL' }, { status: 400 })
      }

      const buffer = Buffer.from(await specFile.arrayBuffer())
      const specContent = await extractTextFromFile(buffer, specFile.name)

      const run = await createForgeRun(session.user.id, {
        mode: 'build',
        repoUrl: repoResult.data,
        specContent,
        specFilename: specFile.name,
        branchName: branchName ?? undefined,
        continuous,
      })
      return NextResponse.json({ runId: run.id })
    }

    const body: unknown = await req.json()
    const buildResult = BuildJsonSchema.safeParse(body)
    if (buildResult.success) {
      const run = await createForgeRun(session.user.id, {
        mode: 'build',
        repoUrl: buildResult.data.repoUrl,
        specContent: buildResult.data.specContent,
        specFilename: buildResult.data.specFilename,
        branchName: buildResult.data.branchName,
        continuous: buildResult.data.continuous,
      })
      return NextResponse.json({ runId: run.id })
    }

    const debugResult = DebugJsonSchema.safeParse(body)
    if (debugResult.success) {
      const run = await createForgeRun(session.user.id, {
        mode: 'debug',
        repoUrl: debugResult.data.repoUrl,
        bugDescription: debugResult.data.bugDescription,
        branchName: debugResult.data.branchName,
        continuous: debugResult.data.continuous,
      })
      return NextResponse.json({ runId: run.id })
    }

    return NextResponse.json(
      { error: 'Invalid request body', details: buildResult.error.format() },
      { status: 400 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getForgeSessionOrDemo()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const runs = await listForgeRuns(session.user.id)
    return NextResponse.json(runs)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
