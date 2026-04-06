import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { DashboardProjectGrid } from '@/src/components/project/dashboard-project-grid';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import {
  Plus,
  Flame,
  GitBranch,
  Zap,
  FolderOpen,
  Rocket,
  ShieldCheck,
  BadgeDollarSign,
  ArrowRight,
  BookOpen,
  Hammer,
  LayoutDashboard,
} from 'lucide-react';
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
        <nav className="hidden items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/70 p-1 md:flex">
          <Button asChild variant="ghost" size="sm">
            <a href="#overview">Overview</a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href="#learn-more">Learn More</a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href="#pricing">Pricing</a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href="#workspace">Workspace</a>
          </Button>
        </nav>
        <Link href="/projects/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
      </Header>

      <PageContainer>
        <div className="space-y-6">
          <section
            id="overview"
            className="grid scroll-mt-24 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]"
          >
            <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-zinc-950 to-cyan-950/60">
              <CardHeader className="space-y-3">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200">
                  <Rocket className="h-3.5 w-3.5" />
                  Product Overview
                </div>
                <CardTitle className="text-3xl tracking-tight text-zinc-50">
                  Generate, verify, and package software work that feels ready to hand off.
                </CardTitle>
                <p className="max-w-3xl text-sm leading-6 text-zinc-300">
                  The One Forge is now framed so the top of the experience can sell the product clearly, while the actual build workspace stays focused on projects, runs, and delivery.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button asChild size="sm">
                    <a href="#workspace">
                      <Hammer className="mr-2 h-4 w-4" />
                      Go to Workspace
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href="#learn-more">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Learn More
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href="#pricing">
                      <BadgeDollarSign className="mr-2 h-4 w-4" />
                      Pricing
                    </a>
                  </Button>
                </div>
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
                  <LayoutDashboard className="h-5 w-5 text-cyan-300" />
                  Product Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">What this page does now</div>
                  <p className="mt-2 leading-6 text-zinc-300">
                    Marketing lives at the top with anchors for product story and pricing. Build-related work stays below in a dedicated workspace area so the homepage feels more organized.
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Why it helps</div>
                  <p className="mt-2 leading-6 text-zinc-300">
                    Someone new can understand the offer fast, while an active user can jump straight to projects and pipelines without wading through the pricing story every time.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a href="#workspace">Jump to current projects</a>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section id="learn-more" className="scroll-mt-24 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">Learn More</div>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">
                  Separate the product story from the build bench.
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                This section frames who Forge is for and what buyers get, while the workspace below stays dedicated to actual project execution.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
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
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">What Buyers Get</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {forgeDeliveryPromises.map((promise) => (
                    <div key={promise} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                      <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                      <span className="text-sm text-zinc-300">{promise}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Trust Signals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {forgeTrustSignals.map((signal) => (
                    <div key={signal} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                      <span className="text-sm text-zinc-300">{signal}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </section>

          <section id="pricing" className="scroll-mt-24 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">Pricing</div>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">
                  Keep the pricing story visible without crowding the workspace.
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                The pricing section now stands on its own so the workspace can stay about pipelines, previews, and real project momentum.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {forgeBetaPlans.map((plan) => (
                <Card key={plan.name} className="border-cyan-500/20">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3 text-lg">
                      <span>{plan.name}</span>
                      <span className="text-xs font-medium text-cyan-300">{plan.price}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="text-zinc-300">{plan.audience}</p>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-zinc-400">
                      {plan.highlight}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section
            id="workspace"
            className="scroll-mt-24 space-y-6 rounded-2xl border border-orange-500/10 bg-black/10 p-5 sm:p-6"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-orange-300">Workspace</div>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">
                  Build-related activity lives here.
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                This is the operational side of Forge: projects, pipeline volume, success rate, and the actual workbench for new runs.
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
                    <CardTitle className="text-lg">Start Here</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 text-sm leading-6 text-zinc-300">
                      Start a project to move from the product story into actual build execution. This workspace will fill with runs, previews, and delivery artifacts once the first project lands.
                    </div>
                    <Link href="/projects/new" className="inline-flex items-center text-sm font-medium text-cyan-300 hover:text-cyan-200">
                      Start with a guided template
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
                <div className="space-y-6">
                  <div className="py-3 text-center">
                    <h2 className="doom-forge-title mb-2 text-2xl uppercase tracking-widest">The One Forge</h2>
                    <p className="doom-forge-poem text-xs tracking-wide">
                      One Forge to build them all, One Pipe to find them, One DAG to bring them all, And in the pipeline bind them.
                    </p>
                  </div>

                  <DashboardProjectGrid projects={projectSummaries} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Workspace Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Core Use Cases</div>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">Founder demos, agency delivery, and backlog relief.</p>
                    </div>
                    <div className="space-y-3">
                      {forgeTrustSignals.map((signal) => (
                        <div key={signal} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                          <span className="text-sm text-zinc-300">{signal}</span>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 text-sm text-zinc-300">Growth Priorities</div>
                  </CardContent>
                </Card>
              </div>
            )}
          </section>
        </div>
      </PageContainer>
    </>
  );
}
