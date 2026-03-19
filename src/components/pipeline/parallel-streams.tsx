'use client';

import { useState } from 'react';
import { Flame, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/button';
import { ScrollArea } from '@/src/components/ui/scroll-area';

interface StreamPane {
  nodeId: string;
  displayName: string;
  text: string;
  isStreaming: boolean;
  status: string;
}

interface ParallelStreamsProps {
  streams: StreamPane[];
  activeStreamId: string | null;
  onSelectStream: (nodeId: string) => void;
}

export function ParallelStreams({ streams, activeStreamId, onSelectStream }: ParallelStreamsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (streams.length === 0) return null;

  // Single stream — show full width
  if (streams.length === 1 || expandedId) {
    const stream = expandedId
      ? streams.find((s) => s.nodeId === expandedId) || streams[0]
      : streams[0];

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
            <span className="text-sm font-medium text-zinc-200">{stream.displayName}</span>
            {streams.length > 1 && (
              <span className="text-xs text-zinc-500">
                ({streams.filter((s) => s.isStreaming).length} streams active)
              </span>
            )}
          </div>
          {streams.length > 1 && (
            <div className="flex items-center gap-1">
              {expandedId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setExpandedId(null)}
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {streams.filter((s) => s.nodeId !== stream.nodeId).map((s) => (
                <button
                  key={s.nodeId}
                  onClick={() => setExpandedId(s.nodeId)}
                  className={cn(
                    'px-2 py-1 text-xs rounded-md border transition-colors',
                    s.isStreaming
                      ? 'border-orange-500/30 text-orange-400 bg-orange-500/10'
                      : 'border-zinc-700 text-zinc-400'
                  )}
                >
                  {s.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
        <ScrollArea className="h-[400px] rounded-lg forge-terminal">
          <div className="p-4 font-mono text-sm text-zinc-200 whitespace-pre-wrap break-words">
            {stream.text || (
              <span className="text-zinc-600">
                <span className="text-orange-500/60">{'>'}</span> Awaiting forge output...
              </span>
            )}
            {stream.isStreaming && (
              <span className="inline-block w-2 h-4 bg-orange-500 ember-glow ml-0.5 rounded-sm" />
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Multiple streams — split pane
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
        <span className="text-sm font-medium text-zinc-200">
          {streams.filter((s) => s.isStreaming).length} nodes forging in parallel
        </span>
      </div>
      <div className={cn(
        'grid gap-2',
        streams.length === 2 ? 'grid-cols-2' : streams.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
      )}>
        {streams.slice(0, 4).map((stream) => (
          <div
            key={stream.nodeId}
            className={cn(
              'rounded-lg border transition-all cursor-pointer',
              activeStreamId === stream.nodeId
                ? 'border-orange-500/40 ring-1 ring-orange-500/20'
                : 'border-zinc-800 hover:border-zinc-700'
            )}
            onClick={() => onSelectStream(stream.nodeId)}
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/50">
              <div className="flex items-center gap-1.5">
                {stream.isStreaming ? (
                  <Flame className="h-3 w-3 text-orange-400 animate-pulse" />
                ) : (
                  <div className="h-3 w-3 rounded-full bg-zinc-600" />
                )}
                <span className="text-[11px] font-medium text-zinc-300 truncate max-w-[120px]">
                  {stream.displayName}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => { e.stopPropagation(); setExpandedId(stream.nodeId); }}
              >
                <Maximize2 className="h-2.5 w-2.5" />
              </Button>
            </div>
            <ScrollArea className="h-[180px]">
              <div className="p-2 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                {stream.text ? stream.text.slice(-800) : (
                  <span className="text-zinc-600 text-[10px]">Waiting...</span>
                )}
                {stream.isStreaming && (
                  <span className="inline-block w-1.5 h-3 bg-orange-500 ember-glow ml-0.5 rounded-sm" />
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>
    </div>
  );
}
