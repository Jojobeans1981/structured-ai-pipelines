import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { encryptApiKey } from '@/src/lib/encryption';
import { apiKeySchema } from '@/src/lib/validators';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  });

  return NextResponse.json({
    data: { hasApiKey: !!dbUser?.encryptedApiKey },
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const parsed = apiKeySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const encryptedKey = encryptApiKey(parsed.data.apiKey);

  await prisma.user.update({
    where: { id: user.id },
    data: { encryptedApiKey: encryptedKey },
  });

  return NextResponse.json({ data: { success: true } });
}

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  await prisma.user.update({
    where: { id: user.id },
    data: { encryptedApiKey: null },
  });

  return NextResponse.json({ data: { success: true } });
}
