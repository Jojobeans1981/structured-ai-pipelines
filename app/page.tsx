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
import { DwarfForgeScene } from '@/src/components/forge/dwarf-forge-scene';

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
      <Header title="The One Forge">
        <Link href="/projects/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
      </Header>
      <PageContainer>
        {projectSummaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-full max-w-lg mb-6">
              <DwarfForgeScene variant="idle" className="opacity-60" />
            </div>
            <h2 className="doom-forge-title text-3xl tracking-widest uppercase mb-1">The One Forge</h2>
            <div className="mt-4 max-w-sm">
              <p className="doom-forge-poem text-sm tracking-wide leading-relaxed">
                One Forge to build them all,<br />
                One Pipe to find them,<br />
                One DAG to bring them all,<br />
                And in the pipeline bind them.
              </p>
              <p className="doom-forge-poem text-xs tracking-wide mt-2 opacity-50">
                In the Land of Vercel where the Dwarves deploy.
              </p>
            </div>
            <Link href="/projects/new" className="mt-8">
              <Button>
                <Flame className="mr-2 h-4 w-4" />
                Ignite the Forge
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* The One Forge poem banner */}
            <div className="text-center py-3">
              <h2 className="doom-forge-title text-2xl tracking-widest uppercase mb-2">The One Forge</h2>
              <p className="doom-forge-poem text-xs tracking-wide">
                One Forge to build them all, One Pipe to find them, One DAG to bring them all, And in the pipeline bind them.
              </p>
            </div>

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
