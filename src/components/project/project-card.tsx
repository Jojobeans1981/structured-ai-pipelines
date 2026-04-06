'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Flame, Clock, GitBranch, CheckCircle2, XCircle, Loader2, FolderOpen, Trash2 } from 'lucide-react';
import { formatDate } from '@/src/lib/utils';
import { type ProjectSummary } from '@/src/types/project';

interface ProjectCardProps {
  project: ProjectSummary;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionChange?: () => void;
}

const statusColors: Record<string, string> = {
  active: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  archived: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
};

const runStatusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
};

const runStatusColors: Record<string, string> = {
  running: 'text-orange-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-zinc-500',
};

const typeLabels: Record<string, { label: string; color: string }> = {
  build: { label: 'Build', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  diagnostic: { label: 'Diagnose', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  refactor: { label: 'Refactor', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  enhance: { label: 'Enhance', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  test: { label: 'Test', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  deploy: { label: 'Deploy', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
};

export function ProjectCard({
  project,
  selectionMode = false,
  selected = false,
  onSelectionChange,
}: ProjectCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();
  const RunIcon = project.lastRunStatus ? runStatusIcons[project.lastRunStatus] || Clock : null;
  const runColor = project.lastRunStatus ? runStatusColors[project.lastRunStatus] || '' : '';
  const typeInfo = project.lastRunType ? typeLabels[project.lastRunType] : null;

  const openDeleteDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (res.ok) {
        setShowDeleteDialog(false);
        router.refresh();
      }
    } catch {
      setDeleting(false);
    }
  };

  const isRunning = project.lastRunStatus === 'running';
  const isCompleted = project.lastRunStatus === 'completed';
  const isFailed = project.lastRunStatus === 'failed';

  const cardContent = (
    <>
      <Card className={cn(
        'cursor-pointer group relative overflow-hidden transition-all duration-300',
        'border-zinc-800/80 hover:border-orange-500/40',
        'hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5',
        isRunning && 'border-orange-500/30 shadow-md shadow-orange-500/5',
        isCompleted && 'border-emerald-500/20',
        isFailed && 'border-red-500/20',
        selectionMode && selected && 'border-orange-400 ring-1 ring-orange-400/50',
      )}>
        {/* Top accent bar */}
        <div className={cn(
          'absolute top-0 left-0 right-0 h-[2px]',
          isRunning ? 'bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 animate-pulse' :
          isCompleted ? 'bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600' :
          isFailed ? 'bg-gradient-to-r from-red-600 via-red-400 to-red-600' :
          'bg-gradient-to-r from-transparent via-orange-500/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity'
        )} />

        {/* Background glow on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/0 via-transparent to-amber-500/0 group-hover:from-orange-500/[0.03] group-hover:to-amber-500/[0.02] transition-all duration-500" />

        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
            <div className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300',
              isRunning ? 'bg-orange-500/20 shadow-inner shadow-orange-500/10' :
              isCompleted ? 'bg-emerald-500/15' :
              isFailed ? 'bg-red-500/15' :
              'bg-zinc-800/50 group-hover:bg-orange-500/15'
            )}>
              <Flame className={cn(
                'h-4 w-4 transition-all duration-300',
                isRunning ? 'text-orange-400 animate-pulse' :
                isCompleted ? 'text-emerald-400' :
                isFailed ? 'text-red-400' :
                'text-zinc-500 group-hover:text-orange-400'
              )} />
            </div>
            <span className="text-zinc-200 group-hover:text-white transition-colors truncate max-w-[180px]">
              {project.name}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectionMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectionChange?.();
                }}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                  selected
                    ? 'border-orange-400 bg-orange-500/15 text-orange-300'
                    : 'border-zinc-700 bg-zinc-900/80 text-zinc-500 hover:border-orange-500/40 hover:text-orange-300'
                )}
                aria-label={selected ? 'Deselect project' : 'Select project'}
              >
                {selected ? <CheckCircle2 className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
              </button>
            )}
            <Badge variant="outline" className={cn('text-[10px] font-medium', statusColors[project.status] || '')}>
              {project.status}
            </Badge>
            {!selectionMode && (
              <button
                onClick={openDeleteDialog}
                disabled={deleting}
                className={cn(
                  'p-1.5 rounded-md transition-all opacity-100',
                  'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
                )}
                title="Delete project"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative">
          <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">
            {project.description || 'No description'}
          </p>

          {/* Metadata row */}
          <div className="mt-4 pt-3 border-t border-zinc-800/50 flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-zinc-600" />
              {formatDate(project.updatedAt)}
            </span>
            {project.runCount > 0 && (
              <span className="flex items-center gap-1.5">
                <GitBranch className="h-3 w-3 text-zinc-600" />
                <span className="text-zinc-400 font-medium">{project.runCount}</span> run{project.runCount !== 1 ? 's' : ''}
              </span>
            )}
            {typeInfo && (
              <Badge variant="outline" className={cn('text-[10px] h-5 font-medium', typeInfo.color)}>
                {typeInfo.label}
              </Badge>
            )}
            {RunIcon && (
              <span className={cn('flex items-center gap-1.5 ml-auto font-medium', runColor)}>
                <RunIcon className={cn('h-3.5 w-3.5', isRunning && 'animate-spin')} />
                {project.lastRunStatus}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );

  return (
    <>
      {selectionMode ? (
        <div role="button" tabIndex={0} onClick={onSelectionChange} onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectionChange?.();
          }
        }}>
          {cardContent}
        </div>
      ) : (
        <Link href={`/projects/${project.id}`}>
          {cardContent}
        </Link>
      )}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {project.name}?</DialogTitle>
            <DialogDescription>
              This will permanently delete the project and all its runs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}
