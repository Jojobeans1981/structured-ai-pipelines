'use client';

import { signIn } from 'next-auth/react';
import { GitBranch, LogIn } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <Card className="w-full max-w-md border-orange-500/20">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/10">
            <GitBranch className="h-6 w-6 text-orange-300" />
          </div>
          <CardTitle className="text-2xl">Sign in to your Forge workspace</CardTitle>
          <p className="text-sm leading-6 text-zinc-400">
            Use your GitLab account to return to the session that owns your saved projects, runs, and settings.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={() => signIn('gitlab', { callbackUrl: '/' })}>
            <LogIn className="mr-2 h-4 w-4" />
            Continue with GitLab
          </Button>
          <Button className="w-full" variant="outline" onClick={() => window.location.assign('/')}>
            Continue in demo mode
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
