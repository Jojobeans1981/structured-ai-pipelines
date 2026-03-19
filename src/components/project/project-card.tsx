'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Flame, Clock, GitBranch, CheckCircle2, XCircle, Loader2, FolderOpen, Trash2 } from 'lucide-react';
import { formatDate } from '@/src/lib/utils';
import { type ProjectSummary } from '@/src/types/project';

interface ProjectCardProps {
  project: ProjectSummary;
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

export function ProjectCard({ project }: ProjectCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const RunIcon = project.lastRunStatus ? runStatusIcons[project.lastRunStatus] || Clock : null;
  const runColor = project.lastRunStatus ? runStatusColors[project.lastRunStatus] || '' : '';
  const typeInfo = project.lastRunType ? typeLabels[project.lastRunType] : null;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="hover:border-orange-500/30 hover:shadow-orange-500/5 cursor-pointer group relative">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Flame className="h-4 w-4 text-orange-500 group-hover:text-orange-400 transition-colors" />
            {project.name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusColors[project.status] || ''}>
              {project.status}
            </Badge>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                'p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100',
                confirmDelete
                  ? 'bg-red-500/20 text-red-400 opacity-100'
                  : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
              )}
              title={confirmDelete ? 'Click again to confirm delete' : 'Delete project'}
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </CardHeader>
        {confirmDelete && (
          <div className="absolute top-0 right-14 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1 text-xs text-red-400">
            Click again to delete
          </div>
        )}
        <CardContent>
          <p className="text-sm text-zinc-400 line-clamp-2">
            {project.description || 'No description'}
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(project.updatedAt)}
            </span>
            {project.runCount > 0 && (
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {project.runCount} run{project.runCount !== 1 ? 's' : ''}
              </span>
            )}
            {typeInfo && (
              <Badge variant="outline" className={cn('text-[10px] h-5', typeInfo.color)}>
                {typeInfo.label}
              </Badge>
            )}
            {RunIcon && (
              <span className={cn('flex items-center gap-1', runColor)}>
                <RunIcon className={cn('h-3 w-3', project.lastRunStatus === 'running' && 'animate-spin')} />
                {project.lastRunStatus}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}
