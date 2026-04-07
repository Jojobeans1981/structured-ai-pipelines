export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getForgeSessionOrDemo } from '@/src/lib/auth-helpers'
import {
  executeForgeLiveLiteScenario,
  listForgeLiveLiteScenarios,
} from '@/src/services/forge/live-lite-executor'

const requestSchema = z.object({
  scenarioIds: z.array(z.string().min(1)).min(1).max(5).optional(),
})

export async function GET(): Promise<NextResponse> {
  const scenarios = listForgeLiveLiteScenarios().map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    type: scenario.type,
    expectedSignals: scenario.expectedSignals,
  }))

  return NextResponse.json({ scenarios })
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getForgeSessionOrDemo()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const available = listForgeLiveLiteScenarios()
  const scenarioIds = parsed.data.scenarioIds?.length
    ? parsed.data.scenarioIds
    : available.map((scenario) => scenario.id)

  const results = []
  for (const scenarioId of scenarioIds) {
    results.push(await executeForgeLiveLiteScenario(session.user.id, scenarioId))
  }

  const passed = results.filter((result) => result.passed).length

  return NextResponse.json({
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
    results,
  })
}
