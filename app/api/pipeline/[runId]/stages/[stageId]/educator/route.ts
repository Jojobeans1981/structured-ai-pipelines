import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { routeTask } from '@/src/lib/model-router';
import { EducatorAgent, type EducatorOutput } from '@/src/services/educator-agent';

export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string; stageId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: params.stageId },
      include: {
        run: {
          include: {
            project: { select: { userId: true } },
          },
        },
      },
    });

    if (!stage || stage.runId !== params.runId) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    if (stage.run.project.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!stage.artifactContent) {
      return NextResponse.json(
        { error: 'Stage has no artifact to analyze' },
        { status: 400 }
      );
    }

    // Check if we already generated educator content for this stage
    // Store it in the stage's streamContent field with an educator prefix
    const existingEducator = stage.run.executionPlan as Record<string, unknown> | null;
    const educatorCache = (existingEducator as Record<string, Record<string, EducatorOutput>> | null)?.educatorCache;
    if (educatorCache?.[params.stageId]) {
      return NextResponse.json({ data: educatorCache[params.stageId] });
    }

    // Route educator to Ollama (light task — free, local)
    const { client, reason } = await routeTask('educator', user.id);
    console.log(`[Educator] ${reason}`);
    const educatorOutput = await EducatorAgent.analyze(
      stage.artifactContent,
      stage.displayName,
      client
    );

    // Cache the educator output in the run's executionPlan JSON
    const currentPlan = (stage.run.executionPlan as Record<string, unknown>) || {};
    const currentCache = (currentPlan.educatorCache as Record<string, EducatorOutput>) || {};
    currentCache[params.stageId] = educatorOutput;

    await prisma.pipelineRun.update({
      where: { id: params.runId },
      data: {
        executionPlan: JSON.parse(JSON.stringify({
          ...currentPlan,
          educatorCache: currentCache,
        })),
      },
    });

    return NextResponse.json({ data: educatorOutput });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GET /stages/[stageId]/educator]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
