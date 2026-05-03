import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getForgeSessionOrDemo } from '@/src/lib/auth-helpers'
import { getForgeRunWithDetails } from '@/src/services/forge/db'
import { Header } from '@/src/components/layout/header'
import { PageContainer } from '@/src/components/layout/page-container'
import { Button } from '@/src/components/ui/button'
import RunDetailView from './run-detail-view'

export default async function ForgeRunDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getForgeSessionOrDemo()
  if (!session?.user?.id) {
    notFound()
  }

  const details = await getForgeRunWithDetails(params.id)
  if (!details || details.run.userId !== session.user.id) {
    notFound()
  }

  const title = details.run.prdTitle || `Run ${params.id.slice(0, 8)}`

  return (
    <>
      <Header title={title}>
        <Button asChild variant="ghost" size="sm">
          <Link href="/forge/runs">
            <ChevronLeft className="mr-1 h-4 w-4" />
            History
          </Link>
        </Button>
      </Header>

      <PageContainer>
        <RunDetailView
          run={details.run}
          initialLogs={details.logs}
          initialDiff={details.diff}
          initialDiagnosis={details.diagnosis}
          initialResult={details.result}
        />
      </PageContainer>
    </>
  )
}
