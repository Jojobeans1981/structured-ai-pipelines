'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Loader2, Flame, Stethoscope, RefreshCw, Sparkles, TestTube, Rocket, GitBranch, Upload, CheckCircle2, Wand2, ShieldCheck, PackageCheck, Save, Trash2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { forgeTemplates, forgeSamplePrompts } from '@/src/lib/product-offerings';
import { loadSavedTemplates, saveSavedTemplates, type SavedForgeTemplate } from '@/src/lib/saved-templates';

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
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; phase: string }>({ current: 0, total: 0, phase: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState(0);
  const [savedTemplates, setSavedTemplates] = useState<SavedForgeTemplate[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSavedTemplates(loadSavedTemplates());
  }, []);

  const showFilePicker = () => {
    console.log('[Upload] showFilePicker called, ref:', !!zipInputRef.current);
    if (zipInputRef.current) {
      zipInputRef.current.value = '';
      zipInputRef.current.click();
    }
  };

  const showFolderPicker = () => {
    console.log('[Upload] showFolderPicker called, ref:', !!folderInputRef.current);
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
      folderInputRef.current.click();
    }
  };

  const handleUpload = async (file: File, projectId?: string) => {
    // This gets called after project creation with the projectId
    if (!projectId) return;
    setIsUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: 1, phase: `Uploading ${file.name}` });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errData.error || 'Upload failed');
      }
      const data = await res.json();
      setUploadedFiles(data.imported);
      setUploadProgress({ current: 1, total: 1, phase: 'Upload complete' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0, phase: '' });
    }
  };

  const handleUploadFiles = async (files: File[], projectId?: string) => {
    if (!projectId) return;
    setIsUploading(true);
    setError(null);
    try {
      const SKIP = [
        'node_modules/', '.git/', '.next/', 'dist/', 'build/', 'out/',
        '__pycache__/', '.venv/', 'venv/', '.tox/', '.mypy_cache/',
        'vendor/', 'target/', 'bin/', 'obj/', '.gradle/', '.idea/',
        '.vs/', '.vscode/', 'coverage/', '.nyc_output/', '.cache/',
        '.DS_Store', 'Thumbs.db', 'package-lock.json', 'yarn.lock',
        'pnpm-lock.yaml', '.env', '.env.local', '.env.production',
      ];
      const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|rb|php|css|scss|html|svg|json|yaml|yml|toml|xml|md|txt|sql|prisma|graphql|sh|bash|dockerfile|editorconfig|gitignore|eslintrc|prettierrc)$/i;
      const MAX_FILES = 200; // Vercel body limit — cap to avoid 500s

      // Filter eligible files first
      const eligible: File[] = [];
      for (const file of files) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = path.split('/');
        const relativePath = parts.length > 1 ? parts.slice(1).join('/') : path;
        if (SKIP.some(s => relativePath.includes(s))) continue;
        if (!TEXT_EXT.test(file.name) && file.name.includes('.')) continue;
        if (file.size > 500_000) continue; // 500KB per file max for upload
        if (file.size === 0) continue;
        eligible.push(file);
      }

      if (eligible.length === 0) throw new Error('No supported files found in folder. Make sure the folder contains source code files (.ts, .js, .py, etc.)');

      // Cap file count — take the most important files first
      const capped = eligible.slice(0, MAX_FILES);
      const skippedCount = eligible.length - capped.length;

      // Read files with progress
      setUploadProgress({ current: 0, total: capped.length, phase: 'Reading files' });
      const fileData: Array<{ filePath: string; content: string }> = [];
      for (let i = 0; i < capped.length; i++) {
        const file = capped[i];
        setUploadProgress({ current: i + 1, total: capped.length, phase: 'Reading files' });
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = path.split('/');
        const relativePath = parts.length > 1 ? parts.slice(1).join('/') : path;
        try {
          const content = await file.text();
          // Skip files with null bytes (binary)
          if (content.includes('\0')) continue;
          fileData.push({ filePath: relativePath, content });
        } catch { /* skip */ }
      }

      if (fileData.length === 0) throw new Error('No readable text files found');

      // Upload with progress — small batches to stay under Vercel body limit
      setUploadProgress({ current: 0, total: fileData.length, phase: 'Uploading' });
      const BATCH_SIZE = 20;
      let totalImported = 0;
      for (let i = 0; i < fileData.length; i += BATCH_SIZE) {
        const batch = fileData.slice(i, i + BATCH_SIZE);
        setUploadProgress({ current: Math.min(i + BATCH_SIZE, fileData.length), total: fileData.length, phase: 'Uploading' });
        const res = await fetch(`/api/projects/${projectId}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: batch }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error('[Upload] Batch failed:', errData);
          // Continue with remaining batches instead of failing entirely
          continue;
        }
        const data = await res.json();
        totalImported += data.imported;
      }

      if (skippedCount > 0) {
        console.log(`[Upload] Capped at ${MAX_FILES} files, skipped ${skippedCount}`);
      }

      setUploadedFiles(totalImported);
      setUploadProgress({ current: 0, total: 0, phase: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0, phase: '' });
    }
  };

  // Store pending uploads to apply after project creation
  const [pendingZip, setPendingZip] = useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const applyTemplate = (templateId: string) => {
    const template = forgeTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setSelectedType(template.pipelineType);
    setName((current) => current.trim() ? current : template.projectName);
    setInput(template.prompt);
    setTouched((prev) => ({ ...prev, name: true, input: true }));
  };

  const applySavedTemplate = (template: SavedForgeTemplate) => {
    setSelectedType(template.pipelineType);
    setName((current) => current.trim() ? current : (template.projectName || ''));
    setInput(template.prompt);
    setTouched((prev) => ({ ...prev, name: true, input: true }));
  };

  const handleSaveTemplate = () => {
    if (!input.trim()) return;

    const nextTemplate: SavedForgeTemplate = {
      id: `${Date.now()}`,
      title: name.trim() || `Saved ${selectedType} template`,
      pipelineType: selectedType as SavedForgeTemplate['pipelineType'],
      prompt: input.trim(),
      projectName: name.trim() || undefined,
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

  const hasFiles = !!(pendingZip || pendingFiles.length > 0);
  const totalSteps = hasFiles ? 3 : 2;

  const uploadLabel = uploadProgress.total > 0
    ? `${uploadProgress.phase} ${uploadProgress.current}/${uploadProgress.total} files...`
    : 'Uploading files...';

  const stepLabels: Record<number, string> = {
    1: 'Creating project...',
    2: hasFiles ? uploadLabel : 'Starting pipeline...',
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
    <Card className="max-w-4xl border-orange-500/10 bg-zinc-950/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-400" />
          New Project
        </CardTitle>
        <p className="text-sm text-zinc-400">
          Pick a template, describe the target outcome, and Forge will shape a runnable delivery package around it.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Wand2 className="h-4 w-4 text-orange-400" />
              Template Gallery
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {forgeTemplates.map((template) => {
                const selected = selectedType === template.pipelineType && input.trim() === template.prompt.trim();
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template.id)}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-all',
                      selected
                        ? 'border-orange-500/40 bg-orange-500/10 shadow-sm shadow-orange-500/10'
                        : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-zinc-100">{template.title}</span>
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                        {template.badge}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">{template.outcome}</p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Try one of these prompts</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {forgeSamplePrompts.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setInput(sample);
                      setTouched((prev) => ({ ...prev, input: true }));
                    }}
                    className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-orange-500/30 hover:text-orange-300"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Saved team-ready templates</div>
                <Button type="button" variant="outline" size="sm" onClick={handleSaveTemplate} disabled={!input.trim()}>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  Save Current
                </Button>
              </div>
              {savedTemplates.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">Prompt Library</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {savedTemplates.map((template) => (
                    <div key={template.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => applySavedTemplate(template)}
                        className="flex-1 text-left"
                      >
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

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <PackageCheck className="h-4 w-4 text-emerald-400" />
                Deliverables
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                Code, generated files, setup guidance, and a project history your team can revisit.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                Trust Layer
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                Verification, retries, and observability make the output feel reviewable instead of mysterious.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <GitBranch className="h-4 w-4 text-orange-400" />
                Best Fit
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                Best for prototypes, client work, internal tools, debugging, deployment packs, and launch-ready starters.
              </p>
            </div>
          </div>
          {/* File inputs — visually hidden but still in DOM and clickable */}
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,.pdf,.md,.txt"
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}
            tabIndex={-1}
            onChange={(e) => {
              console.log('[Upload] ZIP input changed, files:', e.target.files?.length);
              const file = e.target.files?.[0];
              if (file) {
                setPendingZip(file);
                setPendingFiles([]);
                setUploadedFiles(0);
              }
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            directory=""
            multiple
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}
            tabIndex={-1}
            onChange={(e) => {
              console.log('[Upload] Folder input changed, files:', e.target.files?.length);
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                setPendingFiles(files);
                setPendingZip(null);
                setUploadedFiles(0);
              }
            }}
          />

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
            <label className="text-sm font-medium">Pipeline Mode</label>
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
              Describe the outcome you want
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
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-xs text-zinc-500">
              Tip: mention the target user, must-have screens or endpoints, deployment target, and what counts as done.
            </div>
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
            {uploadedFiles > 0 ? (
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  {uploadedFiles} file{uploadedFiles !== 1 ? 's' : ''} uploaded successfully
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setUploadedFiles(0); setPendingZip(null); setPendingFiles([]); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                >
                  clear &amp; upload different files
                </button>
              </div>
            ) : pendingZip || pendingFiles.length > 0 ? (
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="flex items-center gap-2 text-sm text-orange-400">
                  <Upload className="h-4 w-4" />
                  {pendingZip ? `${pendingZip.name} selected` : `${pendingFiles.length} files selected`}
                  {pendingZip && <span className="text-xs text-zinc-500">({(pendingZip.size / 1024).toFixed(0)} KB)</span>}
                </div>
                <p className="text-xs text-zinc-500">Will upload when you hit Create &amp; Start Pipeline</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPendingZip(null); setPendingFiles([]); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline"
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

          {/* Upload progress indicator */}
          {isLoading && step > 0 && (
            <div className="space-y-2 rounded-lg border border-orange-500/20 bg-orange-900/10 p-3">
              <div className="flex items-center gap-2 text-sm text-orange-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Step {step} of {totalSteps}: {stepLabels[step]}</span>
              </div>
              {uploadProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-300"
                      style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500">
                    {uploadProgress.phase}: {uploadProgress.current} / {uploadProgress.total} files
                    ({Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading || !name.trim() || !input.trim()}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Flame className="mr-2 h-4 w-4" />
              )}
              {isLoading ? (stepLabels[step] || 'Creating & Starting...') : 'Create & Start Pipeline'}
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
