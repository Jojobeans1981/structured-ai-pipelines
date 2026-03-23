import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionOrDemo } from '@/src/lib/auth-helpers'
import { listForgeRuns } from '@/src/services/forge/db'
import ModeBadge from '@/src/components/forge/mode-badge'
import RunStatusBadge from '@/src/components/forge/run-status-badge'

export default async function ForgeRunsPage() {
  const session = await getSessionOrDemo()
  if (!session?.user?.id) {
    redirect('/api/auth/signin')
  }

  const runs = await listForgeRuns(session.user.id)

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Run History</h1>
          <p className="text-gray-400 text-sm mt-1">{runs.length} run{runs.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/forge"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          New Run
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p>No runs yet.</p>
          <Link href="/forge" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
            Start your first run →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(run => (
            <Link
              key={run.id}
              href={`/forge/runs/${run.id}`}
              className="flex items-center gap-4 p-4 bg-gray-900/50 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
            >
              <ModeBadge mode={run.mode as 'build' | 'debug'} />
              <RunStatusBadge status={run.status} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {run.prdTitle || `Run ${run.id.slice(0, 8)}`}
                </p>
                <p className="text-gray-500 text-xs font-mono truncate">{run.repoUrl}</p>
              </div>
              <span className="text-gray-600 text-xs">
                {new Date(run.createdAt).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
