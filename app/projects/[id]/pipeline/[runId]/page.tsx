import { notFound } from 'next/navigation';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { PipelineView } from '@/src/components/pipeline/pipeline-view';
import Link from 'next/link';

interface Props {
  params: { id: string; runId: string };
}

export default async function PipelineRunPage({ params }: Props) {
  const session = await getSessionOrDemo();
  if (!session?.user?.id) notFound();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: { project: { select: { userId: true, name: true } } },
  });

  if (!run || run.project.userId !== session.user.id || run.projectId !== params.id) {
    notFound();
  }

  return (
    <>
      <Header title={`${run.type === 'build' ? 'Build' : 'Diagnostic'} Pipeline`}>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Dashboard</Link>
          <span>/</span>
          <Link href={`/projects/${params.id}`} className="hover:text-foreground">{run.project.name}</Link>
          <span>/</span>
          <span className="text-foreground">Pipeline Run</span>
        </nav>
      </Header>
      <PageContainer>
        <PipelineView runId={params.runId} projectId={params.id} />
      </PageContainer>
    </>
  );
}
