'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Loader2, Square, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { ProjectCard } from '@/src/components/project/project-card';
import { type ProjectSummary } from '@/src/types/project';

interface DashboardProjectGridProps {
  projects: ProjectSummary[];
}

const PRACTICE_PROJECT_PATTERN = /\b(practice|test|demo|sandbox|temp|tmp|trial|sample)\b/i;

function looksLikePracticeProject(project: ProjectSummary): boolean {
  return PRACTICE_PROJECT_PATTERN.test(`${project.name} ${project.description || ''}`);
}

export function DashboardProjectGrid({ projects }: DashboardProjectGridProps) {
  const router = useRouter();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;
  const practiceProjectIds = useMemo(
    () => projects.filter(looksLikePracticeProject).map((project) => project.id),
    [projects]
  );

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectionMode(false);
  };

  const toggleProject = (projectId: string) => {
    setSelectedIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  };

  const handleSelectAll = () => {
    setSelectionMode(true);
    setSelectedIds(projects.map((project) => project.id));
  };

  const handleSelectPractice = () => {
    setSelectionMode(true);
    setSelectedIds(practiceProjectIds);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    setDeleting(true);
    try {
      const response = await fetch('/api/projects/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete selected projects');
      }

      setShowDeleteDialog(false);
      clearSelection();
      router.refresh();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
        {!selectionMode ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)}>
              <CheckSquare className="mr-2 h-4 w-4" />
              Select Projects
            </Button>
            <Button variant="outline" size="sm" onClick={handleSelectPractice} disabled={practiceProjectIds.length === 0}>
              <Wand2 className="mr-2 h-4 w-4" />
              Select Practice Projects
            </Button>
            <span className="text-xs text-zinc-500">
              {practiceProjectIds.length > 0
                ? `${practiceProjectIds.length} practice-style project${practiceProjectIds.length === 1 ? '' : 's'} detected`
                : 'No obvious practice-style project names detected'}
            </span>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              <CheckSquare className="mr-2 h-4 w-4" />
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleSelectPractice} disabled={practiceProjectIds.length === 0}>
              <Wand2 className="mr-2 h-4 w-4" />
              Select Practice Projects
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              <Square className="mr-2 h-4 w-4" />
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={selectedCount === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected
            </Button>
            <span className="text-xs text-zinc-400">
              {selectedCount} project{selectedCount === 1 ? '' : 's'} selected
            </span>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            selectionMode={selectionMode}
            selected={selectedSet.has(project.id)}
            onSelectionChange={() => toggleProject(project.id)}
          />
        ))}
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} projects?</DialogTitle>
            <DialogDescription>
              This will permanently delete the selected projects and all associated runs, previews, and files.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting || selectedCount === 0}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
