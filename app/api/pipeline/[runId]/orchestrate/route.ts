import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { OrchestratedRunner } from '@/src/services/orchestrated-runner';
import { Orchestrator } from '@/src/services/orchestrator';

/**
 * POST /api/pipeline/[runId]/orchestrate
 *
 * Ask the Qwen orchestrator what to do next.
 * Returns the action decision — the client or a follow-up call executes it.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: { project: { select: { userId: true } } },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') {
    return NextResponse.json({
      data: { type: 'complete', summary: `Run is ${run.status}` },
    });
  }

  try {
    const action = await OrchestratedRunner.getNextAction(params.runId);
    return NextResponse.json({
      data: action,
      meta: {
        decisionLatencyMs: Orchestrator.getLastDecisionMs(),
        orchestratorAvailable: await Orchestrator.isAvailable(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[POST /orchestrate]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/pipeline/[runId]/orchestrate
 *
 * Get the current orchestrator status and pipeline state summary.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: { project: { select: { userId: true } } },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const state = await OrchestratedRunner.buildPipelineState(params.runId);
    const orchestratorUp = await Orchestrator.isAvailable();

    return NextResponse.json({
      data: {
        orchestratorAvailable: orchestratorUp,
        orchestratorModel: process.env.ORCHESTRATOR_MODEL || 'qwen2.5-coder:1.5b',
        orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://10.10.3.7:11434',
        pipelineState: {
          runId: state.runId,
          type: state.type,
          totalStages: state.stages.length,
          pending: state.stages.filter((s) => s.status === 'pending').length,
          running: state.stages.filter((s) => s.status === 'running').length,
          awaitingApproval: state.stages.filter((s) => s.status === 'awaiting_approval').length,
          approved: state.stages.filter((s) => s.status === 'approved').length,
          failed: state.stages.filter((s) => s.status === 'failed').length,
        },
        backends: state.availableBackends,
        availableSkills: state.availableSkills,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
