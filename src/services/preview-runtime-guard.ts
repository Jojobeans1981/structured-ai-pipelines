import type { WorkerStatusResponse } from '@/src/services/preview-worker-client';

export function detectPreviewRuntimeBlocker(status: Pick<WorkerStatusResponse, 'error' | 'logs'>): string | null {
  const combined = `${status.error || ''}\n${status.logs || ''}`.toLowerCase();

  if (!combined.trim()) {
    return null;
  }

  if (combined.includes('failed to parse source for import analysis')) {
    return 'Vite could not parse one of the generated source files. The project still has invalid JSX or import syntax.';
  }

  if (combined.includes('uri malformed')) {
    return 'The preview server hit a malformed URI/runtime path error while serving the generated app.';
  }

  if (combined.includes('failed to resolve import')) {
    return 'The generated app has a broken import that Vite could not resolve.';
  }

  if (combined.includes('does not provide an export named')) {
    return 'The generated app imports an export that the target module does not actually provide.';
  }

  if (combined.includes('cannot find module')) {
    return 'The generated app still references a module that is missing at runtime.';
  }

  if (combined.includes('npm error code eresolve') || combined.includes('could not resolve dependency')) {
    return 'The generated app still has an npm dependency conflict.';
  }

  return status.error || null;
}

export function summarizePreviewRuntimeLogs(logs: string | null | undefined): string[] {
  if (!logs) return [];

  return logs
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12);
}
