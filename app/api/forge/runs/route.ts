export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSessionOrDemo } from '@/src/lib/auth-helpers'
import { z } from 'zod'
import { createForgeRun, listForgeRuns } from '@/src/services/forge/db'
import { extractTextFromFile } from '@/src/services/forge/utils/markdown'

const BuildJsonSchema = z.object({
  mode: z.literal('build'),
  repoUrl: z.string().url(),
  specContent: z.string().min(1),
  specFilename: z.string().optional(),
  branchName: z.string().optional(),
})

const DebugJsonSchema = z.object({
  mode: z.literal('debug'),
  repoUrl: z.string().url(),
  bugDescription: z.string().min(1),
  branchName: z.string().optional(),
})

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getSessionOrDemo()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = req.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const repoUrl = formData.get('repoUrl') as string
      const branchName = formData.get('branchName') as string | null
      const specFile = formData.get('specFile') as File | null

      if (!repoUrl || !specFile) {
        return NextResponse.json({ error: 'repoUrl and specFile are required' }, { status: 400 })
      }

      const buffer = Buffer.from(await specFile.arrayBuffer())
      const specContent = await extractTextFromFile(buffer, specFile.name)

      const run = await createForgeRun(session.user.id, {
        mode: 'build',
        repoUrl,
        specContent,
        specFilename: specFile.name,
        branchName: branchName ?? undefined,
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
    const session = await getSessionOrDemo()
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
