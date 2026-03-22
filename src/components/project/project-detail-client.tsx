'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Flame, Stethoscope, Clock, Download, Trash2, XCircle, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import { formatDate, formatDuration } from '@/src/lib/utils';
import { BuildStartDialog } from '@/src/components/pipeline/build-start-dialog';
import { DiagnosticStartDialog } from '@/src/components/pipeline/diagnostic-start-dialog';
import { FileTree } from '@/src/components/project/file-tree';
import { CodeViewer } from '@/src/components/code/code-viewer';
import { FileTabs } from '@/src/components/code/file-tabs';

interface RunSummary {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalDurationMs: number | null;
}

interface ProjectDetailClientProps {
  project: { id: string; name: string; description: string; status: string };
  runs: RunSummary[];
}

const statusColors: Record<string, string> = {
  running: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  planning: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

export function ProjectDetailClient({ project, runs: initialRuns }: ProjectDetailClientProps) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [diagnosticDialogOpen, setDiagnosticDialogOpen] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<{ id: string; path: string }[]>([]);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');

  const failedCount = runs.filter((r) => ['failed', 'cancelled', 'planning'].includes(r.status)).length;

  const handleFileSelect = (fileId: string) => {
    setActiveFileId(fileId);
    if (!openFiles.find((f) => f.id === fileId)) {
      setOpenFiles((prev) => [...prev, { id: fileId, path: fileId }]);
    }
  };

  const handleTabClose = (fileId: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.id !== fileId));
    if (activeFileId === fileId) {
      setActiveFileId(openFiles.length > 1 ? openFiles[0].id : null);
    }
  };

  const handleDownload = async () => {
    const res = await fetch(`/api/projects/${project.id}/download`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    // Show feedback prompt after download
    setShowFeedback(true);
  };

  const handleFeedback = async (rating: number, workedOutOfBox: boolean) => {
    const latestRun = runs.find((r) => r.status === 'completed');
    await fetch(`/api/projects/${project.id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating,
        workedOutOfBox,
        comment: feedbackComment || undefined,
        runId: latestRun?.id,
      }),
    });
    setFeedbackSent(true);
    setTimeout(() => { setShowFeedback(false); setFeedbackSent(false); setFeedbackComment(''); }, 2000);
  };

  const handleDeleteRun = async (runId: string) => {
    setIsDeleting(runId);
    try {
      const res = await fetch(`/api/pipeline/${runId}`, { method: 'DELETE' });
      if (res.ok) {
        setRuns((prev) => prev.filter((r) => r.id !== runId));
      }
    } finally {
      setIsDeleting(null);
    }
  };

  const handleCleanup = async () => {
    if (!confirm(`Delete ${failedCount} failed/cancelled runs?`)) return;
    setIsCleaning(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/runs/cleanup`, { method: 'POST' });
      if (res.ok) {
        setRuns((prev) => prev.filter((r) => !['failed', 'cancelled', 'planning'].includes(r.status)));
      }
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <p className="text-zinc-400">{project.description || 'No description'}</p>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={() => setBuildDialogOpen(true)}>
          <Flame className="mr-2 h-4 w-4" /> Start Pipeline
        </Button>
        <Button variant="outline" onClick={() => setDiagnosticDialogOpen(true)}>
          <Stethoscope className="mr-2 h-4 w-4" /> Diagnose
        </Button>
      </div>

      <BuildStartDialog projectId={project.id} open={buildDialogOpen} onOpenChange={setBuildDialogOpen} />
      <DiagnosticStartDialog projectId={project.id} open={diagnosticDialogOpen} onOpenChange={setDiagnosticDialogOpen} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Pipeline History</CardTitle>
          {failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanup}
              disabled={isCleaning}
              className="text-red-400 border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {isCleaning ? 'Cleaning...' : `Clean up ${failedCount} failed`}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-zinc-500">No pipeline runs yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 p-3 transition-colors hover:border-zinc-700 group"
                >
                  <Link
                    href={`/projects/${project.id}/pipeline/${run.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <Badge variant="outline" className="text-xs">
                      {run.type}
                    </Badge>
                    <Badge variant="outline" className={statusColors[run.status] || ''}>
                      {run.status}
                    </Badge>
                  </Link>
                  <div className="flex items-center gap-3 text-sm text-zinc-500">
                    {run.totalDurationMs && (
                      <span className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        {formatDuration(run.totalDurationMs)}
                      </span>
                    )}
                    <span className="text-xs">{formatDate(run.startedAt)}</span>
                    {['failed', 'cancelled', 'planning'].includes(run.status) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        onClick={(e) => { e.preventDefault(); handleDeleteRun(run.id); }}
                        disabled={isDeleting === run.id}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Files */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Generated Files</CardTitle>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" /> Download ZIP
          </Button>
        </CardHeader>
        {showFeedback && (
          <div className="mx-6 mb-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            {feedbackSent ? (
              <p className="text-sm text-emerald-400 text-center">Thanks for the feedback!</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-zinc-300">Did this project work out of the box?</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                    onClick={() => handleFeedback(2, true)}
                  >
                    <ThumbsUp className="mr-2 h-4 w-4" /> Yes, it worked
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-400 border-red-500/20 hover:bg-red-500/10"
                    onClick={() => handleFeedback(1, false)}
                  >
                    <ThumbsDown className="mr-2 h-4 w-4" /> No, had issues
                  </Button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Optional: what went wrong?"
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && feedbackComment) {
                        handleFeedback(1, false);
                      }
                    }}
                  />
                  {feedbackComment && (
                    <Button variant="outline" size="sm" onClick={() => handleFeedback(1, false)}>
                      <MessageSquare className="mr-1 h-3.5 w-3.5" /> Send
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <CardContent>
          <div className="flex rounded-lg border border-zinc-800 min-h-[300px]">
            <div className="w-64 border-r border-zinc-800 overflow-auto">
              <FileTree projectId={project.id} selectedFileId={activeFileId} onFileSelect={handleFileSelect} />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <FileTabs openFiles={openFiles} activeFileId={activeFileId} onTabSelect={setActiveFileId} onTabClose={handleTabClose} />
              <div className="flex-1 overflow-auto">
                <CodeViewer fileId={activeFileId} projectId={project.id} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
