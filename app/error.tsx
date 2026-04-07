'use client';

import { useMemo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/src/components/ui/button';

function getDisplayMessage(error: Error): string {
  if (error.message.includes('Database is unavailable') || error.message.includes('Database request timed out')) {
    return 'The app could not reach its database. Check your DATABASE_URL or start the local Postgres service, then try again.';
  }

  return error.message || 'Something went wrong.';
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = useMemo(() => getDisplayMessage(error), [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
          <h1 className="text-xl font-semibold">Application Error</h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-300">{message}</p>
          <Button onClick={reset} className="mt-6" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </body>
    </html>
  );
}
