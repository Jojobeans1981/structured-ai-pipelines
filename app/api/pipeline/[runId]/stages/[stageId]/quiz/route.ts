import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { EducatorAgent, type EducatorOutput } from '@/src/services/educator-agent';

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string; stageId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const { answers } = body as { answers?: Record<string, number> };

  if (!answers || typeof answers !== 'object') {
    return NextResponse.json(
      { error: 'Missing answers object. Expected { answers: { questionId: selectedIndex } }' },
      { status: 400 }
    );
  }

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

    // Get the cached educator output
    const currentPlan = (stage.run.executionPlan as Record<string, unknown>) || {};
    const educatorCache = (currentPlan.educatorCache as Record<string, EducatorOutput>) || {};
    const educatorOutput = educatorCache[params.stageId];

    if (!educatorOutput) {
      return NextResponse.json(
        { error: 'No educator content found. Call GET /educator first.' },
        { status: 400 }
      );
    }

    // Grade the quiz
    const result = EducatorAgent.gradeQuiz(educatorOutput.quiz, answers);

    // Store the quiz result in the execution plan
    const quizResults = (currentPlan.quizResults as Record<string, unknown>) || {};
    quizResults[params.stageId] = {
      ...result,
      attemptedAt: new Date().toISOString(),
    };

    await prisma.pipelineRun.update({
      where: { id: params.runId },
      data: {
        executionPlan: JSON.parse(JSON.stringify({
          ...currentPlan,
          quizResults,
        })),
      },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /stages/[stageId]/quiz]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
