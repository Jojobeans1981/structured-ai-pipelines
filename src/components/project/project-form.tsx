'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Loader2, Flame, Stethoscope, RefreshCw, Sparkles, TestTube, Rocket, GitBranch, Upload, CheckCircle2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

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

export function ProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<string>('build');
  const [input, setInput] = useState('');
  const [autoApprove, setAutoApprove] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFilePicker = () => {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = '.zip,.pdf,.md,.txt';
    el.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleUpload(file);
    };
    el.click();
  };

  const showFolderPicker = () => {
    const el = document.createElement('input');
    el.type = 'file';
    (el as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    el.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) await handleUploadFiles(files);
    };
    el.click();
  };

  const handleUpload = async (file: File, projectId?: string) => {
    // This gets called after project creation with the projectId
    if (!projectId) return;
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setUploadedFiles(data.imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadFiles = async (files: File[], projectId?: string) => {
    if (!projectId) return;
    setIsUploading(true);
    setError(null);
    try {
      const SKIP = ['node_modules/', '.git/', '.next/', 'dist/', 'build/', '__pycache__/', '.DS_Store', 'package-lock.json', 'yarn.lock'];
      const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|rb|php|css|scss|html|svg|json|yaml|yml|toml|xml|md|txt|sql|prisma|graphql|sh|bash)$/i;
      const fileData: Array<{ filePath: string; content: string }> = [];
      for (const file of files) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = path.split('/');
        const relativePath = parts.length > 1 ? parts.slice(1).join('/') : path;
        if (SKIP.some(s => relativePath.includes(s))) continue;
        if (!TEXT_EXT.test(file.name)) continue;
        if (file.size > 500_000) continue;
        try {
          const content = await file.text();
          fileData.push({ filePath: relativePath, content });
        } catch { /* skip */ }
      }
      if (fileData.length === 0) throw new Error('No supported files found');
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileData }),
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setUploadedFiles(data.imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Store pending uploads to apply after project creation
  const [pendingZip, setPendingZip] = useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const hasFiles = !!(pendingZip || pendingFiles.length > 0);
  const totalSteps = hasFiles ? 3 : 2;

  const stepLabels: Record<number, string> = {
    1: 'Creating project...',
    2: hasFiles ? 'Uploading files...' : 'Starting pipeline...',
    3: 'Starting pipeline...',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mark both fields as touched on submit attempt
    setTouched({ name: true, input: true });
    if (!name.trim() || !input.trim()) return;

    setIsLoading(true);
    setError(null);
    setStep(1);

    try {
      // 1. Create the project
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: input.trim() }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const { data: project } = await createRes.json();

      // 2. Upload files if pending
      if (hasFiles) {
        setStep(2);
        if (pendingZip) {
          await handleUpload(pendingZip, project.id);
        } else if (pendingFiles.length > 0) {
          await handleUploadFiles(pendingFiles, project.id);
        }
      }

      // 3. Start the pipeline
      setStep(hasFiles ? 3 : 2);
      const startRes = await fetch(`/api/projects/${project.id}/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          input: input.trim(),
          mode: 'dag',
          autoApprove,
        }),
      });

      if (!startRes.ok) {
        const data = await startRes.json();
        throw new Error(data.error || 'Failed to start pipeline');
      }

      const { data: run } = await startRes.json();
      router.push(`/projects/${project.id}/pipeline/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsLoading(false);
      setStep(0);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-400" />
          New Project
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Project name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Project Name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
              placeholder="My App"
              disabled={isLoading}
              required
              aria-invalid={touched.name && !name.trim() ? true : undefined}
            />
            {touched.name && !name.trim() && (
              <p className="text-xs text-red-500">Project name is required</p>
            )}
          </div>

          {/* Pipeline type selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">What do you need?</label>
            <div className="grid grid-cols-3 gap-2">
              {pipelineTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
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
          </div>

          {/* Description / input */}
          <div className="space-y-2">
            <label htmlFor="input" className="text-sm font-medium">
              Describe what you need
            </label>
            <Textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, input: true }))}
              placeholder={placeholders[selectedType]}
              rows={5}
              disabled={isLoading}
              required
              aria-invalid={touched.input && !input.trim() ? true : undefined}
              className="bg-zinc-900/50 border-zinc-700 focus:border-orange-500/50"
            />
            {touched.input && !input.trim() && (
              <p className="text-xs text-red-500">Please describe what you need</p>
            )}
          </div>

          {/* Upload zone */}
          <div
            className={cn(
              'rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer',
              uploadedFiles > 0 || pendingZip || pendingFiles.length > 0
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-zinc-700 bg-zinc-900/30 hover:border-zinc-600'
            )}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files[0];
              if (file?.name.endsWith('.zip')) {
                setPendingZip(file);
              } else {
                setPendingFiles(Array.from(e.dataTransfer.files));
              }
            }}
          >
            {pendingZip || pendingFiles.length > 0 ? (
              <div className="flex items-center justify-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {pendingZip ? `${pendingZip.name} ready` : `${pendingFiles.length} files ready`}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPendingZip(null); setPendingFiles([]); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 ml-2 underline"
                >
                  clear
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
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

          {/* Auto-pilot toggle */}
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading || !name.trim() || !input.trim()}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Flame className="mr-2 h-4 w-4" />
              )}
              {isLoading ? 'Creating & Starting...' : 'Create & Start Pipeline'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
