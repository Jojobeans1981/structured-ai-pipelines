'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Plus, Trash2, Upload } from 'lucide-react';

export interface CodeFile {
  id: string;
  filename: string;
  language: string;
  content: string;
}

interface CodeFileInputProps {
  files: CodeFile[];
  onFilesChange: (files: CodeFile[]) => void;
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', css: 'css', html: 'html', json: 'json', md: 'markdown',
  sql: 'sql', prisma: 'prisma', yaml: 'yaml', yml: 'yaml',
};

function inferLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return LANG_MAP[ext] || 'plaintext';
}

export function CodeFileInput({ files, onFilesChange }: CodeFileInputProps) {
  const addFile = () => {
    if (files.length >= 10) return;
    onFilesChange([...files, { id: crypto.randomUUID(), filename: '', language: 'typescript', content: '' }]);
  };

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, updates: Partial<CodeFile>) => {
    onFilesChange(files.map((f) => {
      if (f.id !== id) return f;
      const updated = { ...f, ...updates };
      if (updates.filename) {
        updated.language = inferLanguage(updates.filename);
      }
      return updated;
    }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const remaining = 10 - files.length;
    const toProcess = droppedFiles.slice(0, remaining);

    toProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        const newFile: CodeFile = {
          id: crypto.randomUUID(),
          filename: file.name,
          language: inferLanguage(file.name),
          content,
        };
        onFilesChange([...files, newFile]);
      };
      reader.readAsText(file);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Code Files (optional)</span>
        <Button type="button" variant="outline" size="sm" onClick={addFile} disabled={files.length >= 10}>
          <Plus className="mr-1 h-4 w-4" /> Add File
        </Button>
      </div>

      {files.length === 0 && (
        <div
          className="flex flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center text-muted-foreground"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <Upload className="h-6 w-6" />
          <p className="text-sm">Drop code files here or click &quot;Add File&quot;</p>
        </div>
      )}

      {files.map((file) => (
        <div key={file.id} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Input
              value={file.filename}
              onChange={(e) => updateFile(file.id, { filename: e.target.value })}
              placeholder="src/components/App.tsx"
              className="flex-1 text-sm"
            />
            <span className="text-xs text-muted-foreground w-20">{file.language}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(file.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={file.content}
            onChange={(e) => updateFile(file.id, { content: e.target.value })}
            placeholder="Paste code here..."
            className="font-mono text-sm"
            rows={6}
          />
        </div>
      ))}
    </div>
  );
}
