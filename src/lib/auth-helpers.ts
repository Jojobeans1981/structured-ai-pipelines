import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

// Set to true to bypass auth and use a demo user (for public testing)
const AUTH_BYPASS = true;
const DEMO_USER_EMAIL = 'demo@gauntletforge.dev';

async function getOrCreateDemoUser() {
  let user = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: DEMO_USER_EMAIL, name: 'Demo User' },
    });
  }
  return { id: user.id, name: user.name, email: user.email, image: user.image };
}

export async function getAuthenticatedUser() {
  // Always try real session first
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return session.user;
  }
  // Fall back to demo user if bypass is enabled
  if (AUTH_BYPASS) {
    return getOrCreateDemoUser();
  }
  return null;
}

/**
 * Get the authenticated session, or a demo session when auth is bypassed.
 * Real sessions always take priority over the demo user.
 */
export async function getSessionOrDemo(): Promise<{ user: { id: string; name?: string | null; email?: string | null } } | null> {
  // Always try real session first
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return session as { user: { id: string; name?: string | null; email?: string | null } };
  }
  // Fall back to demo user if bypass is enabled
  if (AUTH_BYPASS) {
    const user = await getOrCreateDemoUser();
    return { user };
  }
  return null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
