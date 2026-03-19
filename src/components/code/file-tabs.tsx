'use client';

import { X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface OpenFile {
  id: string;
  path: string;
}

interface FileTabsProps {
  openFiles: OpenFile[];
  activeFileId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
}

export function FileTabs({ openFiles, activeFileId, onTabSelect, onTabClose }: FileTabsProps) {
  if (openFiles.length === 0) return null;

  return (
    <div className="flex overflow-x-auto border-b bg-muted/30">
      {openFiles.map((file) => {
        const basename = file.path.split('/').pop() || file.path;
        const isActive = file.id === activeFileId;

        return (
          <div
            key={file.id}
            className={cn(
              'flex items-center gap-1 border-r px-3 py-1.5 text-sm cursor-pointer',
              isActive ? 'bg-background border-b-2 border-b-primary' : 'text-muted-foreground hover:bg-accent/50'
            )}
            onClick={() => onTabSelect(file.id)}
            title={file.path}
          >
            <span className="truncate max-w-[120px]">{basename}</span>
            <button
              className="ml-1 rounded p-0.5 hover:bg-accent"
              onClick={(e) => { e.stopPropagation(); onTabClose(file.id); }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
