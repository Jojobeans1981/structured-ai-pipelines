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
  if (AUTH_BYPASS) {
    return getOrCreateDemoUser();
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

/**
 * Get the authenticated session, or a mock session when auth is bypassed.
 * Use this in forge routes that need session.user.id.
 */
export async function getSessionOrDemo(): Promise<{ user: { id: string; name?: string | null; email?: string | null } } | null> {
  if (AUTH_BYPASS) {
    const user = await getOrCreateDemoUser();
    return { user };
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return session as { user: { id: string; name?: string | null; email?: string | null } };
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
