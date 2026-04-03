'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Loader2, Flame, Stethoscope, RefreshCw, Sparkles, TestTube, Rocket, GitBranch, Upload, CheckCircle2, Save, Trash2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { forgeSamplePrompts, forgeTemplates } from '@/src/lib/product-offerings';
import { loadSavedTemplates, saveSavedTemplates, type SavedForgeTemplate } from '@/src/lib/saved-templates';

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
  const [savedTemplates, setSavedTemplates] = useState<SavedForgeTemplate[]>([]);

  useEffect(() => {
    setSavedTemplates(loadSavedTemplates());
  }, []);

  const applyTemplate = (templateId: string) => {
    const template = forgeTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedType(template.pipelineType);
    setInput(template.prompt);
  };

  const applySavedTemplate = (template: SavedForgeTemplate) => {
    setSelectedType(template.pipelineType);
    setInput(template.prompt);
  };

  const handleSaveTemplate = () => {
    if (!input.trim()) return;

    const nextTemplate: SavedForgeTemplate = {
      id: `${Date.now()}`,
      title: `Saved ${selectedType} run`,
      pipelineType: selectedType as SavedForgeTemplate['pipelineType'],
      prompt: input.trim(),
    };

    const next = [nextTemplate, ...savedTemplates].slice(0, 8);
    setSavedTemplates(next);
    saveSavedTemplates(next);
  };

  const handleDeleteTemplate = (templateId: string) => {
    const next = savedTemplates.filter((template) => template.id !== templateId);
    setSavedTemplates(next);
    saveSavedTemplates(next);
  };

  const showFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleUpload(file);
    };
    input.click();
  };

  const showFolderPicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) await handleUploadFiles(files);
    };
    input.click();
  };

  const handleUploadFiles = async (files: File[]) => {
    setIsUploading(true);
    setError(null);
    try {
      // Filter to text files, read contents, send as JSON
      const SKIP = ['node_modules/', '.git/', '.next/', 'dist/', 'build/', '__pycache__/', '.DS_Store', 'package-lock.json', 'yarn.lock'];
      const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|rb|php|css|scss|html|svg|json|yaml|yml|toml|xml|md|txt|sql|prisma|graphql|sh|bash)$/i;

      const fileData: Array<{ filePath: string; content: string }> = [];

      for (const file of files) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

        // Strip the top-level folder from webkitRelativePath (e.g., "my-project/src/App.tsx" → "src/App.tsx")
        const parts = path.split('/');
        const relativePath = parts.length > 1 ? parts.slice(1).join('/') : path;

        if (SKIP.some((s) => relativePath.includes(s))) continue;
        if (!TEXT_EXT.test(relativePath) && !['Dockerfile', 'Makefile', 'Procfile'].includes(relativePath.split('/').pop() || '')) continue;
        if (file.size > 500 * 1024) continue; // skip files > 500KB

        try {
          const content = await file.text();
          if (content.includes('\0')) continue; // binary
          fileData.push({ filePath: relativePath, content });
        } catch { continue; }
      }

      if (fileData.length === 0) {
        setError('No importable source files found in selection');
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileData }),
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
          <div className="space-y-3">
            <div className="text-sm font-medium text-zinc-200">Starter Templates</div>
            <div className="grid gap-2 md:grid-cols-2">
              {forgeTemplates.slice(0, 4).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-left transition-colors hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-100">{template.title}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{template.badge}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{template.outcome}</p>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {forgeSamplePrompts.slice(0, 3).map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setInput(sample)}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-orange-500/30 hover:text-orange-300"
                >
                  {sample}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Saved beta templates</div>
                <Button type="button" variant="outline" size="sm" onClick={handleSaveTemplate} disabled={!input.trim()}>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  Save Current
                </Button>
              </div>
              {savedTemplates.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">Save your favorite run prompt here for repeat testing in this browser.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {savedTemplates.map((template) => (
                    <div key={template.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                      <button type="button" onClick={() => applySavedTemplate(template)} className="flex-1 text-left">
                        <div className="text-sm text-zinc-200">{template.title}</div>
                        <div className="text-xs text-zinc-500">{template.pipelineType}</div>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="h-8 w-8 text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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

          {/* Upload zone — upload existing project for context */}
          <div
            className={cn(
              'rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer',
              uploadedFiles > 0
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-600'
            )}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              // Handle dropped files — could be a ZIP or multiple files from a folder drag
              const items = e.dataTransfer.items;
              if (items && items.length > 0) {
                const firstItem = items[0];
                const file = firstItem.getAsFile();
                if (file && file.name.endsWith('.zip')) {
                  handleUpload(file);
                  return;
                }
                // Multiple files dropped (folder drag) — zip them client-side
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                  await handleUploadFiles(files);
                }
              }
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
                {uploadedFiles} files imported
                <button
                  onClick={(e) => { e.stopPropagation(); setUploadedFiles(0); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 ml-2 underline"
                >
                  clear
                </button>
              </div>
            ) : (
              <div
                className="flex flex-col items-center gap-1.5"
                onClick={() => showFilePicker()}
              >
                <Upload className="h-5 w-5 text-zinc-500" />
                <span className="text-sm text-zinc-400">
                  Upload existing project (ZIP or folder)
                </span>
                <div className="flex gap-3 mt-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); showFilePicker(); }}
                    className="text-xs text-orange-400 hover:text-orange-300 underline"
                  >
                    Select ZIP
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); showFolderPicker(); }}
                    className="text-xs text-orange-400 hover:text-orange-300 underline"
                  >
                    Select folder
                  </button>
                </div>
                <span className="text-xs text-zinc-600">
                  Optional — gives the forge your existing code as context
                </span>
              </div>
            )}
          </div>

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
                    autoApprove ? 'translate-x-[18px]' : 'translate-x-[2px]'
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
