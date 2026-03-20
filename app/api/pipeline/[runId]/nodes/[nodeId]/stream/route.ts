import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { routeTask } from '@/src/lib/model-router';
import { prisma } from '@/src/lib/prisma';
import { DAGExecutor } from '@/src/services/dag-executor';
import { BuildVerifier } from '@/src/services/build-verifier';

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string; nodeId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: {
      project: { select: { userId: true } },
    },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const stage = await prisma.pipelineStage.findUnique({
    where: { id: params.nodeId },
  });

  if (!stage || stage.runId !== params.runId) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }

  if (stage.status !== 'running') {
    return NextResponse.json({ error: 'Node is not running' }, { status: 400 });
  }

  // Handle verify nodes differently
  if (stage.nodeType === 'verify') {
    return handleVerifyNode(params.runId, stage.id, run.outputPath);
  }

  // Route to optimal backend based on skill complexity
  let routingResult;
  try {
    routingResult = await routeTask(stage.skillName, user.id);
    console.log(`[SSE /nodes/stream] ${routingResult.reason}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 403 });
  }
  const anthropicClient = routingResult.client;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let fullText = '';
      try {
        const generator = DAGExecutor.executeNode(
          params.runId,
          stage.id,
          anthropicClient,
          request.signal
        );

        for await (const token of generator) {
          fullText += token;
          send({ type: 'token', data: { text: token } });
        }

        await DAGExecutor.completeNode(stage.id, fullText, fullText);
        send({
          type: 'checkpoint',
          data: { stageId: stage.id, nodeId: stage.nodeId, artifact: fullText },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[SSE /nodes/stream] Node ${stage.id} error:`, message);

        // Reset stage to awaiting_approval with error so user can retry
        try {
          await prisma.pipelineStage.update({
            where: { id: stage.id },
            data: {
              status: 'awaiting_approval',
              artifactContent: `**Error during execution:**\n\n${message}\n\nYou can reject this stage to retry.`,
              streamContent: fullText || null,
            },
          });
        } catch {
          // If we can't even update the stage, log it
          console.error(`[SSE /nodes/stream] Failed to reset stage ${stage.id} after error`);
        }

        send({ type: 'error', data: { message, stageId: stage.id } });
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

async function handleVerifyNode(
  runId: string,
  stageId: string,
  outputPath: string | null
) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // On serverless (no outputPath), auto-pass verification
        if (!outputPath) {
          const artifact = '## Build Verification — Serverless Mode\n\n' +
            '**Status:** SKIPPED (serverless environment)\n\n' +
            'Build verification requires a filesystem to run `npm install && npm run build`. ' +
            'On Vercel, files are stored in the database and downloadable as a ZIP.\n\n' +
            'To verify locally: download the ZIP, extract, run `npm install && npm run build`.';

          send({ type: 'token', data: { text: artifact } });
          await DAGExecutor.completeNode(stageId, artifact, artifact);
          send({ type: 'checkpoint', data: { stageId, artifact } });
          controller.close();
          return;
        }

        send({ type: 'token', data: { text: `Verifying build in ${outputPath}...\n\n` } });

        const result = await BuildVerifier.verify(outputPath);

        let output = '';
        output += `## Build Verification ${result.success ? 'PASSED' : 'FAILED'}\n\n`;
        output += `**Duration:** ${result.durationMs}ms\n\n`;

        if (result.installOutput) {
          output += `### Install Output\n\`\`\`\n${result.installOutput.substring(0, 2000)}\n\`\`\`\n\n`;
        }

        if (result.buildOutput) {
          output += `### Build Output\n\`\`\`\n${result.buildOutput.substring(0, 2000)}\n\`\`\`\n\n`;
        }

        if (result.errors.length > 0) {
          output += `### Errors\n${result.errors.map((e) => `- ${e}`).join('\n')}\n\n`;
        }

        if (result.warnings.length > 0) {
          output += `### Warnings\n${result.warnings.map((w) => `- ${w}`).join('\n')}\n\n`;
        }

        send({ type: 'token', data: { text: output } });

        await DAGExecutor.completeNode(stageId, output, output);
        send({
          type: 'checkpoint',
          data: { stageId, artifact: output },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        try {
          await prisma.pipelineStage.update({
            where: { id: stageId },
            data: {
              status: 'awaiting_approval',
              artifactContent: `**Build verification error:**\n\n${message}\n\nReject to retry.`,
            },
          });
        } catch { /* non-fatal */ }
        send({ type: 'error', data: { message, stageId } });
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
