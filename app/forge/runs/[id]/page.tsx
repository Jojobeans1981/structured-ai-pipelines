import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { authOptions } from '@/src/lib/auth'
import { getForgeRunWithDetails } from '@/src/services/forge/db'
import RunDetailView from './run-detail-view'

export default async function ForgeRunDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/api/auth/signin')
  }

  const details = await getForgeRunWithDetails(params.id)
  if (!details || details.run.userId !== session.user.id) {
    notFound()
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <RunDetailView
        run={details.run}
        initialLogs={details.logs}
        initialDiff={details.diff}
        initialDiagnosis={details.diagnosis}
        initialResult={details.result}
      />
    </div>
  )
}
