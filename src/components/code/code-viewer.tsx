'use client';

import { useState, useEffect, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/src/components/ui/button';
import { Copy, Check } from 'lucide-react';

interface CodeViewerProps {
  fileId: string | null;
  projectId: string;
}

interface FileData {
  id: string;
  filePath: string;
  content: string;
  language: string;
}

export function CodeViewer({ fileId, projectId }: CodeViewerProps) {
  const [file, setFile] = useState<FileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!fileId) { setFile(null); return; }
    setIsLoading(true);
    fetch(`/api/projects/${projectId}/files/${fileId}`)
      .then((res) => res.json())
      .then(({ data }) => setFile(data))
      .catch(() => setFile(null))
      .finally(() => setIsLoading(false));
  }, [fileId, projectId]);

  const handleCopy = useCallback(async () => {
    if (!file) return;
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [file]);

  if (!fileId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a file to view
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-muted" />;
  }

  if (!file) {
    return <div className="flex items-center justify-center h-64 text-destructive">Failed to load file</div>;
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-3 py-1.5 bg-muted/50">
        <span className="text-sm font-mono text-muted-foreground">{file.filePath}</span>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={file.language}
        showLineNumbers
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8rem' }}
      >
        {file.content}
      </SyntaxHighlighter>
    </div>
  );
}
