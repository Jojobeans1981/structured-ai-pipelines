'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/src/components/ui/button';

function getDisplayMessage(error: Error): string {
  if (error.message.includes('Database is unavailable') || error.message.includes('Database request timed out')) {
    return 'This Forge run cannot load because the database is unreachable right now. Check your DATABASE_URL or start the local Postgres service, then retry.';
  }

  return error.message || 'Failed to load Forge run.';
}

export default function ForgeRunError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
      <h2 className="text-lg font-semibold text-zinc-100">Forge Run Error</h2>
      <p className="mt-2 max-w-md text-sm text-red-400">{getDisplayMessage(error)}</p>
      <Button onClick={reset} className="mt-6" variant="outline">
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}
