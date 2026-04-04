'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Copy, Download, ExternalLink, Loader2, Rocket, Share2 } from 'lucide-react';

interface RunLaunchPanelProps {
  projectId: string;
  runId: string;
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

  return null;
}

export function RunLaunchPanel({ projectId, runId }: RunLaunchPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  const handlePreview = async () => {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to launch preview';
      setError(formatPreviewError(message));
      setErrorHint(formatPreviewHint(message));
    } finally {
      setLoadingPreview(false);
    }
  };

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
        <div className="flex flex-wrap gap-3">
          <Button onClick={handlePreview} disabled={loadingPreview}>
            {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            {previewUrl ? 'Refresh Preview' : 'Launch Preview'}
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
              Open Preview
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
