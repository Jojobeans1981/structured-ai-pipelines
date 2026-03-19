import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { MetricsService } from '@/src/services/metrics-service';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || undefined;
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  const history = await MetricsService.getMetricsHistory(user.id, type, limit);
  return NextResponse.json({ data: history });
}
