'use client';

import { useState, useEffect } from 'react';
import { Folder, FolderOpen, FileCode, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface FileInfo {
  id: string;
  filePath: string;
  language: string;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  fileId?: string;
  children: TreeNode[];
}

function buildTree(files: FileInfo[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      const isLast = i === parts.length - 1;

      let existing = current.find((n) => n.name === name);
      if (!existing) {
        existing = {
          name,
          path,
          isDir: !isLast,
          fileId: isLast ? file.id : undefined,
          children: [],
        };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    return nodes
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => ({ ...n, children: sortNodes(n.children) }));
  }

  return sortNodes(root);
}

interface TreeNodeProps {
  node: TreeNode;
  depth: number;
  selectedFileId: string | null;
  onFileSelect: (fileId: string) => void;
}

function TreeNodeComponent({ node, depth, selectedFileId, onFileSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.isDir) {
    return (
      <div>
        <button
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-accent"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expanded ? <FolderOpen className="h-4 w-4 text-yellow-500" /> : <Folder className="h-4 w-4 text-yellow-500" />}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children.map((child) => (
          <TreeNodeComponent
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFileId={selectedFileId}
            onFileSelect={onFileSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      className={cn(
        'flex w-full items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-accent',
        selectedFileId === node.fileId && 'bg-accent text-accent-foreground'
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      onClick={() => node.fileId && onFileSelect(node.fileId)}
    >
      <FileCode className="h-4 w-4 text-blue-400" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

interface FileTreeProps {
  projectId: string;
  selectedFileId: string | null;
  onFileSelect: (fileId: string) => void;
}

export function FileTree({ projectId, selectedFileId, onFileSelect }: FileTreeProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/files`);
        if (res.ok) {
          const { data } = await res.json();
          setFiles(data);
        }
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [projectId]);

  if (isLoading) {
    return <div className="space-y-2 p-2">{[1,2,3].map((i) => <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />)}</div>;
  }

  if (files.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No files generated yet.</p>;
  }

  const tree = buildTree(files);

  return (
    <div className="py-2">
      {tree.map((node) => (
        <TreeNodeComponent key={node.path} node={node} depth={0} selectedFileId={selectedFileId} onFileSelect={onFileSelect} />
      ))}
    </div>
  );
}
