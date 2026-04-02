import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/prisma';

function readBooleanEnv(name: string): boolean | null {
  const raw = process.env[name]?.trim().toLowerCase()
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

function shouldBypassAuth(): boolean {
  const explicit = readBooleanEnv('AUTH_BYPASS_DEMO')
  if (explicit !== null) return explicit

  // Safe default: demo auth is only enabled outside production unless explicitly overridden.
  return process.env.NODE_ENV !== 'production'
}

function shouldEnableForgeGuestAccess(): boolean {
  const explicit = readBooleanEnv('FORGE_GUEST_ACCESS')
  if (explicit !== null) return explicit

  // Forge is safe to browse in guest/demo mode by default so others can try it
  // without opening auth across the rest of the app.
  return true
}

const AUTH_BYPASS = shouldBypassAuth();
const FORGE_GUEST_ACCESS = shouldEnableForgeGuestAccess();
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

/**
 * Forge-specific session resolver.
 * Keeps Forge open to guest/demo users by default, even when the rest of the
 * app still requires authentication.
 */
export async function getForgeSessionOrDemo(): Promise<{ user: { id: string; name?: string | null; email?: string | null } } | null> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return session as { user: { id: string; name?: string | null; email?: string | null } };
  }

  if (FORGE_GUEST_ACCESS || AUTH_BYPASS) {
    const user = await getOrCreateDemoUser();
    return { user };
  }

  return null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
