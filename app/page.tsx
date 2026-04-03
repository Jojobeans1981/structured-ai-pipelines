import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { ProjectCard } from '@/src/components/project/project-card';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Plus, Flame, GitBranch, Zap, FolderOpen, Rocket, ShieldCheck, BadgeDollarSign, ArrowRight } from 'lucide-react';
import {
  forgeBetaPlans,
  forgeBetaPromises,
  forgeBuyerPersonas,
  forgeDeliveryPromises,
  forgeTrustSignals,
} from '@/src/lib/product-offerings';
import { type ProjectSummary } from '@/src/types/project';
import { DwarfForgeScene } from '@/src/components/forge/dwarf-forge-scene';

export default async function DashboardPage() {
  const session = await getSessionOrDemo();
  if (!session?.user?.id) notFound();

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
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
            <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-zinc-950 to-cyan-950/60">
              <CardHeader className="space-y-3">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200">
                  <Rocket className="h-3.5 w-3.5" />
                  Beta Product Mode
                </div>
                <CardTitle className="text-3xl tracking-tight text-zinc-50">
                  Generate, verify, and package software work that feels ready to hand off.
                </CardTitle>
                <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                  The One Forge is now framed for beta testers: no login friction, faster guided starts, and clearer delivery artifacts for demos, internal tools, fixes, and launch-ready scaffolds.
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {forgeBetaPromises.map((promise) => (
                  <div key={promise} className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200">
                    {promise}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-cyan-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BadgeDollarSign className="h-5 w-5 text-cyan-300" />
                  Early Pricing Story
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {forgeBetaPlans.map((plan) => (
                  <div key={plan.name} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-zinc-100">{plan.name}</span>
                      <span className="text-xs font-medium text-cyan-300">{plan.price}</span>
                    </div>
                    <p className="mt-1 text-zinc-400">{plan.audience}</p>
                    <p className="mt-2 text-xs text-zinc-500">{plan.highlight}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            {forgeBuyerPersonas.map((persona) => (
              <Card key={persona.title}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{persona.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-zinc-400">{persona.description}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          {projectSummaries.length === 0 ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-orange-500/10 bg-black/10 py-12 text-center">
                <div className="mb-6 w-full max-w-lg">
                  <DwarfForgeScene variant="idle" className="opacity-60" />
                </div>
                <h2 className="doom-forge-title mb-1 text-3xl uppercase tracking-widest">The One Forge</h2>
                <div className="mt-4 max-w-sm">
                  <p className="doom-forge-poem text-sm leading-relaxed tracking-wide">
                    One Forge to build them all,<br />
                    One Pipe to find them,<br />
                    One DAG to bring them all,<br />
                    And in the pipeline bind them.
                  </p>
                  <p className="doom-forge-poem mt-2 text-xs tracking-wide opacity-50">
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

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">What Buyers Get</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {forgeDeliveryPromises.map((promise) => (
                      <div key={promise} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                        <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                        <span className="text-sm text-zinc-300">{promise}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {forgeTrustSignals.map((signal) => (
                      <div key={signal} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                        <span className="text-sm text-zinc-300">{signal}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/projects/new" className="inline-flex items-center text-sm font-medium text-cyan-300 hover:text-cyan-200">
                    Start with a guided template
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
                <div className="space-y-6">
                  <div className="py-3 text-center">
                    <h2 className="doom-forge-title mb-2 text-2xl uppercase tracking-widest">The One Forge</h2>
                    <p className="doom-forge-poem text-xs tracking-wide">
                      One Forge to build them all, One Pipe to find them, One DAG to bring them all, And in the pipeline bind them.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-400">
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
                          {Math.round((completedRuns / totalRuns) * 100)}%
                        </span> success rate
                      </span>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {projectSummaries.map((project) => (
                      <ProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Beta Readiness Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Current posture</div>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">
                        This beta is strongest for founder demos, agency starter delivery, and engineering backlog relief. Auth is intentionally off so testers can move quickly.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {forgeTrustSignals.map((signal) => (
                        <div key={signal} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                          <span className="text-sm text-zinc-300">{signal}</span>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 text-sm text-zinc-300">
                      Best next monetization layer: workspace collaboration, deploy targets, and hosted billing after beta feedback stabilizes.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
