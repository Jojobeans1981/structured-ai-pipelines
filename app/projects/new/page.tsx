import { redirect } from 'next/navigation';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { ProjectForm } from '@/src/components/project/project-form';

export default async function NewProjectPage() {
  const session = await getSessionOrDemo();
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
