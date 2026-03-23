import { redirect, notFound } from 'next/navigation';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { ProjectDetailClient } from '@/src/components/project/project-detail-client';

interface Props {
  params: { id: string };
}

export default async function ProjectDetailPage({ params }: Props) {
  const session = await getSessionOrDemo();
  if (!session?.user?.id) redirect('/api/auth/signin');

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      runs: {
        orderBy: { startedAt: 'desc' },
        select: { id: true, type: true, status: true, startedAt: true, completedAt: true, totalDurationMs: true },
      },
    },
  });

  if (!project || project.userId !== session.user.id) notFound();

  return (
    <>
      <Header title={project.name} />
      <PageContainer>
        <ProjectDetailClient
          project={{
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
          }}
          runs={project.runs.map((r) => ({
            id: r.id,
            type: r.type,
            status: r.status,
            startedAt: r.startedAt.toISOString(),
            completedAt: r.completedAt?.toISOString() || null,
            totalDurationMs: r.totalDurationMs,
          }))}
        />
      </PageContainer>
    </>
  );
}
