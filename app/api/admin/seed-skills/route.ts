import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { SkillLoader } from '@/src/services/skill-loader';

/**
 * POST /api/admin/seed-skills — Seed all skills from local filesystem to database.
 * Only works when running locally (skills must exist in .claude/skills/).
 * This is a one-time operation to populate the Skill table.
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const count = await SkillLoader.seedSkillsToDb();
    return NextResponse.json({ seeded: count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
