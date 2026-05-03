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
  GitMerge,
  Hammer,
  Bug,
  FolderOpen,
  GitBranch,
  Zap,
  ArrowRight,
  Search,
  Code2,
  CheckCircle2,
  Sparkles,
  PenLine,
} from 'lucide-react';
import { forgeBuyerPersonas } from '@/src/lib/product-offerings';
import { type ProjectSummary } from '@/src/types/project';

export default async function DashboardPage() {
  const session = await getSessionOrDemo();
  if (!session?.user?.id) notFound();

  const dashboardData = await loadDashboardData(session.user.id);
  const { projects, totalRuns, completedRuns, databaseAvailable } = dashboardData;

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
        <div className="space-y-10">

          {/* ── Hero ── */}
          <section className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-zinc-950 to-zinc-900 px-8 py-10">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-orange-300">
                <Flame className="h-3.5 w-3.5" />
                AI Software Factory
              </div>
              <h1 className="mb-4 text-4xl font-bold tracking-tight text-zinc-50">
                Build any software product.<br />
                <span className="text-orange-400">No experience required.</span>
              </h1>
              <p className="mb-8 text-base leading-7 text-zinc-400">
                Describe what you want in plain English — Forge generates the code, verifies it builds,
                and hands you a reviewed diff before anything ships. Tech experts and total beginners both welcome.
              </p>

              {/* Two-path CTAs */}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link href="/forge" className="group">
                  <div className="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 px-5 py-4 text-left transition-all hover:border-orange-500/50 hover:bg-orange-500/15">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
                    <div>
                      <div className="font-semibold text-zinc-100">New here? Start guided</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Answer a few questions — Forge writes the spec for you</div>
                    </div>
                  </div>
                </Link>
                <Link href="/forge" className="group">
                  <div className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-900/50 px-5 py-4 text-left transition-all hover:border-zinc-600 hover:bg-zinc-900">
                    <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
                    <div>
                      <div className="font-semibold text-zinc-100">Have a spec? Go direct</div>
                      <div className="text-xs text-zinc-400 mt-0.5">Paste or upload your spec and run immediately</div>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </section>

          {/* ── How it works ── */}
          <section className="space-y-4">
            <div className="text-center">
              <div className="text-xs font-medium uppercase tracking-widest text-cyan-400">How it works</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Three steps, human in the loop</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="relative rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30">
                  <Search className="h-5 w-5" />
                </div>
                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-orange-400">Step 1</div>
                <h3 className="mb-2 font-semibold text-zinc-100">You describe the work</h3>
                <p className="text-sm leading-6 text-zinc-400">
                  Paste a feature spec, bug report, or upload a markdown file. Add your GitLab repo URL. That's it — Forge handles the rest.
                </p>
              </div>

              <div className="relative rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30">
                  <Code2 className="h-5 w-5" />
                </div>
                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-cyan-400">Step 2</div>
                <h3 className="mb-2 font-semibold text-zinc-100">Forge writes the code</h3>
                <p className="text-sm leading-6 text-zinc-400">
                  Forge clones your repo, reads your existing patterns and conventions, then generates the implementation. It runs the build to verify it compiles — and auto-fixes errors if it doesn't.
                </p>
              </div>

              <div className="relative rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-400">Step 3</div>
                <h3 className="mb-2 font-semibold text-zinc-100">You review &amp; approve</h3>
                <p className="text-sm leading-6 text-zinc-400">
                  You see the plan before any code is written, and the diff before anything is pushed. Approve both gates and Forge opens a GitLab merge request on a clean branch.
                </p>
              </div>
            </div>

            {/* Flow bar */}
            <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 px-6 py-4 text-xs text-zinc-500">
              {[
                'Clone repo',
                'Read conventions',
                'Generate code',
                'Verify build',
                '→ Auto-fix if needed',
                'Approve plan',
                'Approve diff',
                'Open merge request',
              ].map((step, i) => (
                <span key={i} className={`flex items-center gap-2 ${step.startsWith('→') ? 'text-amber-500/70' : ''}`}>
                  {i > 0 && !step.startsWith('→') && <span className="text-zinc-700">·</span>}
                  {step}
                </span>
              ))}
            </div>
          </section>

          {/* ── Two modes ── */}
          <section className="grid gap-4 sm:grid-cols-2">
            <Card className="border-orange-500/20 bg-orange-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-orange-300">
                  <Hammer className="h-4 w-4" />
                  Build Mode
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="leading-6 text-zinc-300">
                  Give Forge a feature spec — a markdown doc, pasted text, or uploaded file — plus your repo URL. It generates a full implementation: code, tests, Dockerfile, and CI config.
                </p>
                <ul className="space-y-1.5 text-zinc-400">
                  {['Analyzes your existing code conventions', 'Generates repo-aware implementation', 'Runs build verification + auto-fix loop', 'Creates branch + merge request'].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-orange-500/60" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button asChild size="sm" className="w-full mt-2">
                  <Link href="/forge">Start building →</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-cyan-500/20 bg-cyan-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-cyan-300">
                  <Bug className="h-4 w-4" />
                  Debug Mode
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="leading-6 text-zinc-300">
                  Describe a bug and paste any error logs or stack traces. Forge maps your codebase, identifies the root cause, plans the fix, and generates a targeted patch — no guessing.
                </p>
                <ul className="space-y-1.5 text-zinc-400">
                  {['Maps affected files and call paths', 'Root cause analysis with evidence', 'Targeted fix — smallest safe change', 'Creates branch + merge request'].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-cyan-500/60" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" size="sm" className="w-full mt-2">
                  <Link href="/forge">Start debugging →</Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* ── Who it's for ── */}
          <section className="space-y-4">
            <div className="text-center">
              <div className="text-xs font-medium uppercase tracking-widest text-cyan-400">Use cases</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Built for real engineering work</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {forgeBuyerPersonas.map((persona) => (
                <Card key={persona.title}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-zinc-100">{persona.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-zinc-400">{persona.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Workspace / Projects ── */}
          <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/30 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-widest text-orange-400">Workspace</div>
                <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-50">Your projects</h2>
              </div>
              <div className="flex items-center gap-4 text-sm text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-orange-400" />
                  <span className="font-medium text-zinc-200">{projects.length}</span> projects
                </span>
                {totalRuns > 0 && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <GitBranch className="h-4 w-4 text-orange-400" />
                      <span className="font-medium text-zinc-200">{totalRuns}</span> runs
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-emerald-400" />
                      <span className="font-medium text-zinc-200">
                        {Math.round((completedRuns / totalRuns) * 100)}%
                      </span> success
                    </span>
                  </>
                )}
                {!databaseAvailable && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                    Demo mode
                  </span>
                )}
              </div>
            </div>

            {projectSummaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-14 text-center">
                <GitMerge className="mb-4 h-10 w-10 text-zinc-700" />
                <p className="text-sm font-medium text-zinc-400">No projects yet</p>
                <p className="mt-1 text-xs text-zinc-600">Create a project to start tracking your Forge runs</p>
                <Button asChild size="sm" className="mt-5">
                  <Link href="/projects/new">
                    <Flame className="mr-2 h-4 w-4" />
                    Create your first project
                  </Link>
                </Button>
              </div>
            ) : (
              <DashboardProjectGrid projects={projectSummaries} />
            )}

            <div className="flex justify-end">
              <Button asChild variant="ghost" size="sm" className="text-zinc-500 hover:text-zinc-300">
                <Link href="/forge/runs">
                  View all runs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>

        </div>
      </PageContainer>
    </>
  );
}

async function loadDashboardData(userId: string): Promise<{
  projects: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { runs: number };
    runs: Array<{ status: string; type: string }>;
  }>;
  totalRuns: number;
  completedRuns: number;
  databaseAvailable: boolean;
}> {
  try {
    const [projects, totalRuns, completedRuns] = await Promise.all([
      prisma.project.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { runs: true } },
          runs: {
            orderBy: { startedAt: 'desc' },
            take: 1,
            select: { status: true, type: true },
          },
        },
      }),
      prisma.pipelineRun.count({
        where: { project: { userId } },
      }),
      prisma.pipelineRun.count({
        where: { project: { userId }, status: 'completed' },
      }),
    ]);

    return { projects, totalRuns, completedRuns, databaseAvailable: true };
  } catch (err) {
    console.warn('[Dashboard] Database unavailable; rendering offline demo state.', err);
    return {
      projects: [],
      totalRuns: 0,
      completedRuns: 0,
      databaseAvailable: false,
    };
  }
}
