import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { MetricsService } from '@/src/services/metrics-service';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const breakdown = await MetricsService.getAgentBreakdown(user.id);
    return NextResponse.json(breakdown);
  } catch (error) {
    console.error('[API /metrics/agents] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch agent metrics' }, { status: 500 });
  }
}
