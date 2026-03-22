import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { getAnthropicClient } from '@/src/lib/anthropic';
import { PipelineEngine } from '@/src/services/pipeline-engine';
import { StageExecutor } from '@/src/services/stage-executor';

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  let run;
  try {
    run = await PipelineEngine.getRunWithStages(params.runId);
  } catch {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  if (run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const currentStage = run.stages.find((s) => s.status === 'running');

  if (!currentStage) {
    return NextResponse.json(
      { error: 'No running stage found for this pipeline run' },
      { status: 400 }
    );
  }

  let anthropicClient;
  try {
    anthropicClient = await getAnthropicClient(user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const context = await PipelineEngine.getStageContext(
    params.runId,
    currentStage.stageIndex
  );

  const previousArtifacts = run.stages
    .filter((s) => s.status === 'approved' && s.artifactContent)
    .map((s) => s.artifactContent!);

  const stageId = currentStage.id;
  const skillName = currentStage.skillName;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const executor = new StageExecutor(anthropicClient);
        const generator = executor.executeStage(
          skillName,
          context,
          previousArtifacts
        );

        let fullText = '';
        for await (const token of generator) {
          fullText += token;
          send({ type: 'token', data: { text: token } });
        }

        await PipelineEngine.completeStage(stageId, fullText, fullText);
        send({
          type: 'checkpoint',
          data: { stageId, artifact: fullText },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        console.error(`[SSE /stream] Stage ${stageId} error:`, message);
        send({ type: 'error', data: { message } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
