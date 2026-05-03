import Link from 'next/link'
import { History, Hammer, Bug } from 'lucide-react'
import { Header } from '@/src/components/layout/header'
import { PageContainer } from '@/src/components/layout/page-container'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card'
import ModeSelector from '@/src/components/forge/mode-selector'

export default function ForgePage() {
  return (
    <>
      <Header title="Forge">
        <Button asChild variant="outline" size="sm">
          <Link href="/forge/runs">
            <History className="mr-2 h-4 w-4" />
            Run History
          </Link>
        </Button>
      </Header>

      <PageContainer>
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="space-y-1">
            <p className="text-sm leading-6 text-zinc-400">
              Build features or fix bugs — Forge clones your repo, generates code, and opens a merge request.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              <div>
                <div className="text-sm font-medium text-zinc-200">Build Mode</div>
                <p className="mt-0.5 text-xs leading-5 text-zinc-500">Paste or upload a feature spec and Forge generates, verifies, and ships the code.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <Bug className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <div>
                <div className="text-sm font-medium text-zinc-200">Debug Mode</div>
                <p className="mt-0.5 text-xs leading-5 text-zinc-500">Describe a bug with logs and Forge diagnoses, fixes, and creates a merge request.</p>
              </div>
            </div>
          </div>

          <Card className="border-zinc-800">
            <CardHeader className="pb-4">
              <CardTitle className="text-base text-zinc-100">Start a Run</CardTitle>
            </CardHeader>
            <CardContent>
              <ModeSelector />
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </>
  )
}
