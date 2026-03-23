import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { ProjectCard } from '@/src/components/project/project-card';
import { Button } from '@/src/components/ui/button';
import { Plus, Flame, GitBranch, Zap, FolderOpen } from 'lucide-react';
import { type ProjectSummary } from '@/src/types/project';

export default async function DashboardPage() {
  const session = await getSessionOrDemo();
  if (!session?.user?.id) redirect('/api/auth/signin');

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { runs: true } },
      runs: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: { status: true, type: true },
      },
    },
  });

  const totalRuns = await prisma.pipelineRun.count({
    where: { project: { userId: session.user.id } },
  });

  const completedRuns = await prisma.pipelineRun.count({
    where: { project: { userId: session.user.id }, status: 'completed' },
  });

  const projectSummaries: ProjectSummary[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status as ProjectSummary['status'],
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    runCount: p._count.runs,
    lastRunStatus: p.runs[0]?.status ?? null,
    lastRunType: p.runs[0]?.type ?? null,
  }));

  return (
    <>
      <Header title="Dashboard">
        <Link href="/projects/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
      </Header>
      <PageContainer>
        {projectSummaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="relative mb-6">
              <Flame className="h-16 w-16 text-orange-500/30 flame-flicker" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Flame className="h-16 w-16 text-orange-500/10 blur-lg" />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-zinc-200">The forge awaits</h2>
            <p className="mt-2 text-sm text-zinc-500 max-w-sm">
              Create your first project to begin forging code with structured AI pipelines.
            </p>
            <Link href="/projects/new" className="mt-6">
              <Button>
                <Flame className="mr-2 h-4 w-4" />
                Ignite a Project
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats bar */}
            <div className="flex items-center gap-6 text-sm text-zinc-400">
              <span className="flex items-center gap-1.5">
                <FolderOpen className="h-4 w-4 text-orange-400" />
                <span className="font-medium text-zinc-200">{projects.length}</span> projects
              </span>
              <span className="flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-orange-400" />
                <span className="font-medium text-zinc-200">{totalRuns}</span> pipeline runs
              </span>
              {totalRuns > 0 && (
                <span className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-emerald-400" />
                  <span className="font-medium text-zinc-200">
                    {totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 0}%
                  </span> success rate
                </span>
              )}
            </div>

            {/* Project grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projectSummaries.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}
