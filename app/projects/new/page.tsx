import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/src/lib/auth';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { ProjectForm } from '@/src/components/project/project-form';

export default async function NewProjectPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/api/auth/signin');

  return (
    <>
      <Header title="New Project" />
      <PageContainer>
        <ProjectForm />
      </PageContainer>
    </>
  );
}
