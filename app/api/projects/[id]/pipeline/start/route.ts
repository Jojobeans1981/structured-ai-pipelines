import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';

export const maxDuration = 60;
import { startPipelineSchema } from '@/src/lib/validators';
import { PipelineEngine } from '@/src/services/pipeline-engine';
import { getAnthropicClient } from '@/src/lib/anthropic';
import { IntakeAgent } from '@/src/services/intake-agent';
import { DAGExecutor } from '@/src/services/dag-executor';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const parsed = startPipelineSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 }
    );
  }

  const userData = await prisma.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });

  if (!userData?.encryptedApiKey) {
    return NextResponse.json(
      { error: 'No API key configured. Please add your Anthropic API key in Settings.' },
      { status: 403 }
    );
  }

  const executionMode = parsed.data.mode || 'dag';

  try {
    if (executionMode === 'linear') {
      // Legacy linear mode
      const run = await PipelineEngine.startRun(
        params.id,
        user.id,
        parsed.data.type,
        parsed.data.input
      );
      return NextResponse.json({ data: run }, { status: 201 });
    }

    // DAG mode: create run, generate plan, create stages
    const run = await prisma.pipelineRun.create({
      data: {
        projectId: params.id,
        type: parsed.data.type,
        status: 'planning',
        userInput: parsed.data.input,
        currentStageIndex: 0,
        executionMode: 'dag',
      },
    });

    // Generate execution plan
    let plan;
    try {
      const client = await getAnthropicClient(user.id);
      plan = await IntakeAgent.generatePlan(parsed.data.input, client);
    } catch (err) {
      console.warn('[POST /pipeline/start] Intake agent failed, using default plan:', err);
      plan = IntakeAgent.defaultBuildPlan(3);
    }

    // Create stages from plan
    await DAGExecutor.createStagesFromPlan(run.id, plan);

    // Fetch the full run with stages
    const fullRun = await prisma.pipelineRun.findUnique({
      where: { id: run.id },
      include: {
        stages: { orderBy: { stageIndex: 'asc' } },
      },
    });

    return NextResponse.json({ data: fullRun }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /pipeline/start]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
