'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Loader2, Flame, Stethoscope, RefreshCw, Sparkles, TestTube, Rocket, GitBranch, Upload, CheckCircle2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface BuildStartDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const pipelineTypes = [
  { id: 'build', label: 'Build', icon: Flame, description: 'Create a new project from scratch', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  { id: 'diagnostic', label: 'Diagnose', icon: Stethoscope, description: 'Find and fix a bug', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  { id: 'refactor', label: 'Refactor', icon: RefreshCw, description: 'Restructure existing code', color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
  { id: 'enhance', label: 'Enhance', icon: Sparkles, description: 'Add features to existing project', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { id: 'test', label: 'Test', icon: TestTube, description: 'Generate test suites', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  { id: 'deploy', label: 'Deploy', icon: Rocket, description: 'Generate deployment config', color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' },
] as const;

const placeholders: Record<string, string> = {
  build: 'Describe the project you want to build...',
  diagnostic: 'Describe the bug — what you expected vs what happened...',
  refactor: 'Describe what code to refactor and the desired outcome...',
  enhance: 'Describe the feature to add to your existing project...',
  test: 'Describe what code needs tests and any specific testing requirements...',
  deploy: 'Describe your deployment target and requirements...',
};

export function BuildStartDialog({ projectId, open, onOpenChange }: BuildStartDialogProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [selectedType, setSelectedType] = useState<string>('build');
  const [autoApprove, setAutoApprove] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }
      const data = await res.json();
      setUploadedFiles(data.imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleStart = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          input: input.trim(),
          mode: 'dag',
          autoApprove,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start pipeline');
      }

      const { data: run } = await res.json();
      onOpenChange(false);
      setInput('');
      setSelectedType('build');
      router.push(`/projects/${projectId}/pipeline/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start pipeline');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-400" />
            Start a Forge Pipeline
          </DialogTitle>
          <DialogDescription>
            Choose a pipeline type and describe what you need.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2">
            {pipelineTypes.map((type) => {
              const Icon = type.icon;
              const isSelected = selectedType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all text-center',
                    isSelected
                      ? type.color
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{type.label}</span>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-zinc-500">
            {pipelineTypes.find((t) => t.id === selectedType)?.description}
          </p>

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholders[selectedType]}
            rows={5}
            disabled={isLoading}
            className="bg-zinc-900/50 border-zinc-700 focus:border-orange-500/50"
          />

          {/* Upload zone — shown for types that work with existing code */}
          {['enhance', 'diagnostic', 'refactor', 'test', 'deploy'].includes(selectedType) && (
            <div
              className={cn(
                'rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer',
                uploadedFiles > 0
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-600'
              )}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.zip';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleUpload(file);
                };
                input.click();
              }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleUpload(file);
              }}
            >
              {isUploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing files...
                </div>
              ) : uploadedFiles > 0 ? (
                <div className="flex items-center justify-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {uploadedFiles} files imported — ready to {selectedType}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Upload className="h-5 w-5 text-zinc-500" />
                  <span className="text-sm text-zinc-400">
                    Drop a project ZIP here or click to upload
                  </span>
                  <span className="text-xs text-zinc-600">
                    Existing code will be used as context for {selectedType}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <GitBranch className="h-3.5 w-3.5" />
              <span>{autoApprove ? 'Full auto — no approvals needed' : 'DAG execution — approve each stage'}</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-zinc-400">Auto-pilot</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoApprove}
                onClick={() => setAutoApprove(!autoApprove)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  autoApprove ? 'bg-orange-500' : 'bg-zinc-700'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                    autoApprove ? 'translate-x-4.5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </label>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={isLoading || !input.trim()}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flame className="mr-2 h-4 w-4" />}
              {isLoading ? 'Planning...' : 'Ignite'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
