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

function formatPreviewError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('does not have permission to access the docker daemon')) {
    return 'Live preview is blocked because this app cannot access the Docker daemon. Docker is installed, but the current server process needs Docker Desktop/daemon permission.';
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

  return null;
}

export function RunLaunchPanel({ projectId, runId }: RunLaunchPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [stoppingPreview, setStoppingPreview] = useState(false);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<PreviewCapabilities | null>(null);

  useEffect(() => {
    let active = true;

    fetch(`/api/projects/${projectId}/preview`)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setCapabilities(data);
        if (data.activePreview?.status === 'running' && data.activePreview.previewUrl) {
          setPreviewUrl(data.activePreview.previewUrl);
          setPreviewExpiresAt(data.activePreview.expiresAt || null);
        }
      })
      .catch(() => {
        if (!active) return;
        setCapabilities({
          livePreviewAvailable: false,
          livePreviewReason: 'Preview capability check failed.',
          fallbackPreviewAvailable: true,
          fallbackUrl: `/projects/${projectId}/preview`,
          activePreview: null,
        });
      })
      .finally(() => {
        if (active) setLoadingCapabilities(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  const handlePreview = async () => {
    if (capabilities && !capabilities.livePreviewAvailable) {
      setError(formatPreviewError(capabilities.livePreviewReason || 'Live preview requires Docker.'));
      setErrorHint(formatPreviewHint(capabilities.livePreviewReason || 'Live preview requires Docker.'));
      return;
    }

    setLoadingPreview(true);
    setError(null);
    setErrorHint(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttlMinutes: 30 }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to launch preview');

      setPreviewUrl(data.url || null);
      setPreviewExpiresAt(data.expiresAt || null);
      setCapabilities((current) => current ? {
        ...current,
        activePreview: {
          id: data.sessionId,
          provider: data.provider,
          status: 'running',
          previewUrl: data.url || null,
          containerId: data.containerId || null,
          port: data.port || null,
          expiresAt: data.expiresAt || null,
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          error: null,
        },
      } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to launch preview';
      setError(formatPreviewError(message));
      setErrorHint(formatPreviewHint(message));
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

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    setErrorHint(null);
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
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
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
            {copyState === 'copied' ? <Copy className="mr-2 h-4 w-4" /> : <Share2 className="mr-2 h-4 w-4" />}
            {copyState === 'copied' ? 'Link Copied' : 'Copy Share Link'}
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
        {error && (
          <div className="space-y-1">
            <p className="text-sm text-red-400">{error}</p>
            {errorHint && <p className="text-xs text-zinc-500">{errorHint}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
