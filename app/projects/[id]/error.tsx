'use client';

import { Button } from '@/src/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
      <h2 className="text-lg font-semibold text-zinc-100">Project Error</h2>
      <p className="mt-2 text-sm text-red-400 max-w-md">{error.message}</p>
      <Button onClick={reset} className="mt-6" variant="outline">
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}
