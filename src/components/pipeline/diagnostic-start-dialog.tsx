'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Loader2, Stethoscope } from 'lucide-react';
import { CodeFileInput, type CodeFile } from '@/src/components/pipeline/code-file-input';

interface DiagnosticStartDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiagnosticStartDialog({ projectId, open, onOpenChange }: DiagnosticStartDialogProps) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatInput = (): string => {
    let input = `## Bug Description\n${description.trim()}`;

    if (codeFiles.length > 0) {
      input += '\n\n## Code Files';
      for (const file of codeFiles) {
        if (file.content.trim()) {
          input += `\n\n### ${file.filename || 'unnamed'}\n\`\`\`${file.language}\n${file.content.trim()}\n\`\`\``;
        }
      }
    }

    return input;
  };

  const handleStart = async () => {
    if (!description.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/pipeline/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'diagnostic', input: formatInput() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start diagnostic');
      }

      const { data: run } = await res.json();
      onOpenChange(false);
      router.push(`/projects/${projectId}/pipeline/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start diagnostic');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5" />
            Start Diagnostic Pipeline
          </DialogTitle>
          <DialogDescription>
            Describe the bug and optionally include relevant code files. The pipeline will trace, analyze, plan, and fix the issue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Bug Description *</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the bug: what happens, what should happen, error messages..."
              rows={4}
              disabled={isLoading}
            />
          </div>

          <CodeFileInput files={codeFiles} onFilesChange={setCodeFiles} />

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleStart} disabled={isLoading || !description.trim()}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Stethoscope className="mr-2 h-4 w-4" />}
              Start Diagnosis
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
