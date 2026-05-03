import Link from 'next/link'
import { History, Sparkles, PenLine } from 'lucide-react'
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

          {/* Two-path explainer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                <PenLine className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-semibold text-zinc-200">Know what you want?</span>
              </div>
              <p className="text-xs leading-5 text-zinc-500">
                Paste your spec directly or upload a doc. Forge clones your repo, generates the code, and opens a merge request.
              </p>
            </div>
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-orange-400" />
                <span className="text-sm font-semibold text-orange-200">Not sure how to describe it?</span>
              </div>
              <p className="text-xs leading-5 text-zinc-500">
                Click <strong className="text-orange-400 font-medium">"Help me describe it"</strong> — answer a few plain-English questions and Forge writes the spec for you.
              </p>
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
