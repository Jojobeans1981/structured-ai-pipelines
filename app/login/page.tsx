'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Flame, LogIn, Shield } from 'lucide-react';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8000';

export default function LoginPage() {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleGoogleLogin = () => {
    setIsRedirecting(true);
    window.location.href = `${GATEWAY_URL}/auth/google`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Flame className="h-10 w-10 text-orange-500 flame-flicker" />
          <h1 className="text-3xl font-bold forge-gradient-text">Gauntlet Forge</h1>
        </div>
        <p className="text-zinc-400 text-sm max-w-md">
          AI-powered software factory. Sign in to create projects, run pipelines, and forge code.
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-lg flex items-center justify-center gap-2">
            <Shield className="h-5 w-5 text-cyan-400" />
            Sign In
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            size="lg"
            onClick={handleGoogleLogin}
            disabled={isRedirecting}
          >
            {isRedirecting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Redirecting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Continue with Google
              </span>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-zinc-500">or</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            size="lg"
            onClick={() => window.location.href = '/'}
          >
            <Flame className="mr-2 h-4 w-4 text-orange-400" />
            Continue as Demo User
          </Button>

          <p className="text-xs text-zinc-500 text-center">
            Google login goes through the API gateway with JWT session tokens.
            Demo mode uses GitLab OAuth directly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
