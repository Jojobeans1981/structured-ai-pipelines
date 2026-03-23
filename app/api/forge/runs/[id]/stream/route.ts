export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { getSessionOrDemo } from '@/src/lib/auth-helpers'
import { getForgeRun, updateForgeRun } from '@/src/services/forge/db'
import type { SSEEvent } from '@/src/services/forge/types/sse'
import { runBuildPipelineStage1 } from '@/src/services/forge/build-pipeline'
import { runDebugPipelineStage1 } from '@/src/services/forge/debug-pipeline'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const session = await getSessionOrDemo()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const runId = params.id
  const run = await getForgeRun(runId)

  if (!run) {
    return new Response('Run not found', { status: 404 })
  }

  if (run.status !== 'pending') {
    return new Response('Run already started or completed', { status: 409 })
  }

  const encoder = new TextEncoder()
  const transformStream = new TransformStream()
  const writer = transformStream.writable.getWriter()

  const emit = (event: SSEEvent): void => {
    const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
    writer.write(encoder.encode(sseData)).catch(() => {})
  }

  const runPipeline = async (): Promise<void> => {
    await updateForgeRun(runId, { status: 'running' })
    try {
      if (run.mode === 'build') {
        await runBuildPipelineStage1({
          userId: session.user.id,
          runId,
          specContent: run.specContent ?? '',
          repoUrl: run.repoUrl,
          emit,
        })
      } else {
        await runDebugPipelineStage1({
          userId: session.user.id,
          runId,
          bugDescription: run.bugDescription ?? '',
          repoUrl: run.repoUrl,
          emit,
        })
      }
      await updateForgeRun(runId, { status: 'awaiting_approval', stage: 'plan' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pipeline failed'
      await updateForgeRun(runId, { status: 'failed', error: message })
      emit({ type: 'status', status: 'failed' })
    } finally {
      emit({ type: 'done' })
      writer.close()
    }
  }

  void runPipeline()

  return new Response(transformStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
