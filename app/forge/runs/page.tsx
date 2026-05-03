import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getForgeSessionOrDemo } from '@/src/lib/auth-helpers'
import { listForgeRuns } from '@/src/services/forge/db'
import type { ForgeRun } from '@/src/services/forge/db'
import { Header } from '@/src/components/layout/header'
import { PageContainer } from '@/src/components/layout/page-container'
import { Button } from '@/src/components/ui/button'
import ModeBadge from '@/src/components/forge/mode-badge'
import RunStatusBadge from '@/src/components/forge/run-status-badge'

export default async function ForgeRunsPage() {
  const session = await getForgeSessionOrDemo()
  if (!session?.user?.id) {
    notFound()
  }

  let runs: ForgeRun[] = []
  let databaseAvailable = true
  try {
    runs = await listForgeRuns(session.user.id)
  } catch (err) {
    databaseAvailable = false
    console.warn('[ForgeRuns] Database unavailable; rendering offline history state.', err)
  }

  return (
    <>
      <Header title="Run History">
        <Button asChild size="sm">
          <Link href="/forge">
            <Plus className="mr-2 h-4 w-4" />
            New Run
          </Link>
        </Button>
      </Header>

      <PageContainer>
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            {databaseAvailable
              ? `${runs.length} run${runs.length !== 1 ? 's' : ''}`
              : 'Database offline — run history unavailable.'}
          </p>

          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/40 py-16 text-center">
              <p className="text-sm text-zinc-500">
                {databaseAvailable ? 'No runs yet.' : 'Run history is unavailable until the database is running.'}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/forge">Start your first run</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map(run => (
                <Link
                  key={run.id}
                  href={`/forge/runs/${run.id}`}
                  className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900/60"
                >
                  <ModeBadge mode={run.mode as 'build' | 'debug'} />
                  <RunStatusBadge status={run.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {run.prdTitle || `Run ${run.id.slice(0, 8)}`}
                    </p>
                    <p className="truncate font-mono text-xs text-zinc-500">{run.repoUrl}</p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-600">
                    {new Date(run.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </>
  )
}
