import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/src/lib/auth';
import { prisma } from '@/src/lib/prisma';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { ApiKeyForm } from '@/src/components/settings/api-key-form';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/api/auth/signin');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { encryptedApiKey: true },
  });

  return (
    <>
      <Header title="Settings" />
      <PageContainer>
        <div className="max-w-2xl space-y-6">
          <ApiKeyForm hasApiKey={!!user?.encryptedApiKey} />
        </div>
      </PageContainer>
    </>
  );
}
