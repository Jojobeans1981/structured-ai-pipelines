'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Copy, Download, ExternalLink, Loader2, Rocket, Share2 } from 'lucide-react';

interface RunLaunchPanelProps {
  projectId: string;
  runId: string;
}

interface PreviewCapabilities {
  livePreviewAvailable: boolean;
  livePreviewReason: string | null;
  previewProvider?: 'local-docker' | 'preview-worker' | 'none';
  previewProviderLabel?: string;
  fallbackPreviewAvailable: boolean;
  fallbackUrl: string;
  activePreview?: {
    id: string;
    provider: string;
    status: string;
    previewUrl: string | null;
    containerId: string | null;
    port: number | null;
    expiresAt: string | null;
    startedAt: string | null;
    stoppedAt: string | null;
    error: string | null;
  } | null;
}

interface PreviewLaunchErrorPayload {
  error?: string;
  blockers?: string[];
  warnings?: string[];
}

interface PreviewLaunchSuccessPayload {
  sessionId: string;
  url: string | null;
  containerId: string | null;
  port: number | null;
  expiresAt: string | null;
  ttlSeconds: number;
  provider: string;
}

function summarizePreviewError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('does not have permission to access the docker daemon')) {
    return 'Live preview is blocked because this app cannot access the Docker daemon. Docker is installed, but the current server process needs Docker Desktop/daemon permission.';
  }

  if (lower.includes('preview worker request timed out')) {
    return 'Preview launch took too long. The worker may still be starting the app, or the generated app may be stuck during install/startup.';
  }

  if (lower.includes('eresolve unable to resolve dependency tree')) {
    return 'The generated app has an npm dependency conflict, so the preview container could not finish installing dependencies.';
  }

  if (lower.includes("cannot find module '@vitejs/plugin-react'")) {
    return 'The generated app is missing `@vitejs/plugin-react`, so Vite could not start.';
  }

  if (lower.includes('live preview requires docker')) {
    return message;
  }

  return message;
}

function formatPreviewHint(message: string): string | null {
  const lower = message.toLowerCase();

  if (lower.includes('does not have permission to access the docker daemon')) {
    return 'Try confirming Docker Desktop is running, then restart this Next.js server from a shell that has Docker access.';
  }

  if (lower.includes('live preview requires docker')) {
    return 'If this machine should support previews, verify Docker Desktop is installed, running, and reachable from the server process.';
  }

  if (lower.includes('preview worker')) {
    return 'Check that the remote preview worker is deployed, reachable from this app, and has Docker access.';
  }

  if (lower.includes('eresolve unable to resolve dependency tree')) {
    return 'Regenerate or fix the project so package versions are compatible, then launch preview again.';
  }

  if (lower.includes("cannot find module '@vitejs/plugin-react'")) {
    return 'Add `@vitejs/plugin-react` to the generated project and keep its version compatible with Vite.';
  }

  if (lower.includes('preview launch took too long')) {
    return 'Refresh this page after a moment. If no preview URL appears, inspect the generated project dependencies.';
  }

  return null;
}

export function RunLaunchPanel({ projectId, runId }: RunLaunchPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [stoppingPreview, setStoppingPreview] = useState(false);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [shareCopyState, setShareCopyState] = useState<'idle' | 'copied'>('idle');
  const [previewCopyState, setPreviewCopyState] = useState<'idle' | 'copied'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<PreviewCapabilities | null>(null);

  useEffect(() => {
    let active = true;

    const refreshCapabilities = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/preview`, { cache: 'no-store' });
        const data = await res.json();
        if (!active) return;
        setCapabilities(data);
        if (data.activePreview?.status === 'running' && data.activePreview.previewUrl) {
          setPreviewUrl(data.activePreview.previewUrl);
          setPreviewExpiresAt(data.activePreview.expiresAt || null);
        }
      } catch {
        if (!active) return;
        setCapabilities({
          livePreviewAvailable: false,
          livePreviewReason: 'Preview capability check failed.',
          fallbackPreviewAvailable: true,
          fallbackUrl: `/projects/${projectId}/preview`,
          activePreview: null,
        });
      } finally {
        if (active) setLoadingCapabilities(false);
      }
    };

    refreshCapabilities();

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!capabilities?.activePreview || capabilities.activePreview.status !== 'running') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/preview`, { cache: 'no-store' });
        const data = await res.json();
        setCapabilities(data);
        if (data.activePreview?.status === 'running' && data.activePreview.previewUrl) {
          setPreviewUrl(data.activePreview.previewUrl);
          setPreviewExpiresAt(data.activePreview.expiresAt || null);
        }
      } catch {
        // Keep the current preview state if background refresh fails once.
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [projectId, capabilities?.activePreview?.id, capabilities?.activePreview?.status]);

  const handlePreview = async () => {
    if (capabilities && !capabilities.livePreviewAvailable) {
      setError(summarizePreviewError(capabilities.livePreviewReason || 'Live preview requires Docker.'));
      setErrorHint(formatPreviewHint(capabilities.livePreviewReason || 'Live preview requires Docker.'));
      setErrorDetails([]);
      return;
    }

    setLoadingPreview(true);
    setError(null);
    setErrorHint(null);
    setErrorDetails([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlMinutes: 30 }),
      });

      const data = await res.json().catch(() => ({})) as PreviewLaunchErrorPayload & Partial<PreviewLaunchSuccessPayload>;
      if (!res.ok) {
        const details = [
          ...((Array.isArray(data.blockers) ? data.blockers : []).map((item) => `Blocker: ${item}`)),
          ...((Array.isArray(data.warnings) ? data.warnings : []).map((item) => `Warning: ${item}`)),
        ];

        const error = new Error(data.error || 'Failed to launch preview') as Error & { details?: string[] };
        error.details = details;
        throw error;
      }

      const successData = data as PreviewLaunchSuccessPayload;

      setPreviewUrl(successData.url || null);
      setPreviewExpiresAt(successData.expiresAt || null);
      setCapabilities((current) => current ? {
        ...current,
        activePreview: {
          id: successData.sessionId,
          provider: successData.provider,
          status: 'running',
          previewUrl: successData.url || null,
          containerId: successData.containerId || null,
          port: successData.port || null,
          expiresAt: successData.expiresAt || null,
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          error: null,
        },
      } : current);

      if (successData.url) {
        window.open(successData.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to launch preview';
      const details = err instanceof Error && 'details' in err && Array.isArray((err as Error & { details?: string[] }).details)
        ? (err as Error & { details?: string[] }).details ?? []
        : [];
      const summary = summarizePreviewError(message);
      setError(summary);
      setErrorHint(formatPreviewHint(message) || (summary !== message ? 'Full launch logs are available from the preview worker if you need deeper debugging.' : null));
      setErrorDetails(details);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleFallbackPreview = () => {
    const fallbackUrl = capabilities?.fallbackUrl || `/projects/${projectId}/preview`;
    window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
  };

  const handleStopPreview = async () => {
    if (!activePreview?.containerId) return;

    setStoppingPreview(true);
    setError(null);
    setErrorHint(null);
    setErrorDetails([]);

    try {
      await fetch(`/api/projects/${projectId}/preview`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerId: activePreview.containerId,
          provider: activePreview.provider,
        }),
      });

      setPreviewUrl(null);
      setPreviewExpiresAt(null);
      setCapabilities((current) => current ? {
        ...current,
        activePreview: current.activePreview ? {
          ...current.activePreview,
          status: 'stopped',
          stoppedAt: new Date().toISOString(),
        } : current.activePreview,
      } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop preview';
      setError(message);
    } finally {
      setStoppingPreview(false);
    }
  };

  const previewProvider = capabilities?.previewProvider || 'none';
  const previewProviderLabel = capabilities?.previewProviderLabel || 'Live preview';
  const activePreview = capabilities?.activePreview || null;
  const livePreviewButtonLabel = previewProvider === 'preview-worker'
    ? (previewUrl ? 'Refresh Remote Preview' : 'Launch Remote Preview')
    : (previewUrl ? 'Refresh Live Preview' : 'Launch Live Preview');
  const openPreviewButtonLabel = previewProvider === 'preview-worker' ? 'Open Remote Preview' : 'Open Preview';
  const handleCopyPreviewUrl = async () => {
    if (!previewUrl) return;

    try {
      await navigator.clipboard.writeText(previewUrl);
      setPreviewCopyState('copied');
      setTimeout(() => setPreviewCopyState('idle'), 1500);
    } catch {
      setError('Could not copy preview URL to clipboard');
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    setErrorHint(null);
    setErrorDetails([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/download`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to download project');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `forge-project-${projectId.slice(-8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download project');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/run/${runId}`);
      setShareCopyState('copied');
      setTimeout(() => setShareCopyState('idle'), 1500);
    } catch {
      setError('Could not copy link to clipboard');
    }
  };

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-5 w-5 text-orange-400" />
          Launch & Share
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-300">
          Turn this run into something demoable right away: open a live preview when available, export the artifact, or share the run link with a teammate.
        </p>
        {!loadingCapabilities && capabilities && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
            {capabilities.livePreviewAvailable
              ? `${previewProviderLabel} is available for this run.`
              : 'Live preview is unavailable on this host. Fallback preview remains available from stored project files.'}
            {capabilities.livePreviewReason ? ` ${capabilities.livePreviewReason}` : ''}
            {activePreview?.status === 'running' && activePreview.previewUrl ? ' An active preview is already running for this project.' : ''}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handlePreview}
            disabled={loadingPreview || loadingCapabilities || (capabilities ? !capabilities.livePreviewAvailable : false)}
          >
            {loadingPreview || loadingCapabilities ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            {livePreviewButtonLabel}
          </Button>
          <Button variant="secondary" onClick={handleFallbackPreview} disabled={loadingCapabilities || (capabilities ? !capabilities.fallbackPreviewAvailable : false)}>
            <Rocket className="mr-2 h-4 w-4" />
            Open Fallback Preview
          </Button>
          <Button variant="outline" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download ZIP
          </Button>
          <Button variant="outline" onClick={handleCopyShare}>
            {shareCopyState === 'copied' ? <Copy className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}
            {shareCopyState === 'copied' ? 'Link Copied' : 'Copy Share Link'}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.open(`${window.location.origin}/share/run/${runId}`, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Share Page
          </Button>
          {previewUrl && (
            <Button variant="secondary" onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>
              <Rocket className="mr-2 h-4 w-4" />
              {openPreviewButtonLabel}
            </Button>
          )}
          {previewUrl && (
            <Button variant="outline" onClick={handleCopyPreviewUrl}>
              <Copy className="mr-2 h-4 w-4" />
              {previewCopyState === 'copied' ? 'Preview URL Copied' : 'Copy Preview URL'}
            </Button>
          )}
          {activePreview?.status === 'running' && activePreview.containerId && (
            <Button variant="outline" onClick={handleStopPreview} disabled={stoppingPreview}>
              {stoppingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Stop Preview
            </Button>
          )}
        </div>
        {previewUrl && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
            <div className="text-zinc-200 break-all">{previewUrl}</div>
            {previewExpiresAt && (
              <div className="mt-1 text-xs text-zinc-500">
                Preview expires {new Date(previewExpiresAt).toLocaleString()}
              </div>
            )}
            {activePreview?.provider && (
              <div className="mt-1 text-xs text-zinc-500">
                Provider: {activePreview.provider === 'preview-worker' ? 'Remote preview worker' : 'Local Docker'}
              </div>
            )}
          </div>
        )}
        {loadingPreview && (
          <p className="text-xs text-zinc-500">
            Launching preview. This can take up to 90 seconds while the worker installs dependencies and starts the app.
          </p>
        )}
        {error && (
          <div className="space-y-1">
            <p className="text-sm text-red-400">{error}</p>
            {errorHint && <p className="text-xs text-zinc-500">{errorHint}</p>}
            {errorDetails.length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
                {errorDetails.map((detail) => (
                  <p key={detail}>{detail}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
