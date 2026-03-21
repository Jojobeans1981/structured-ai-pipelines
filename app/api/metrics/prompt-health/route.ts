import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { MetricsService } from '@/src/services/metrics-service';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const health = await MetricsService.getPromptHealth();
  return NextResponse.json({ data: health });
}
