import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { LearningStore } from '@/src/services/learning-store';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const [patterns, stats] = await Promise.all([
    LearningStore.getAllPatterns(),
    LearningStore.getStats(),
  ]);

  return NextResponse.json({
    data: { patterns, stats },
  });
}
