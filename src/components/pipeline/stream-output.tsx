'use client';

import { useRef, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/src/components/ui/scroll-area';

interface StreamOutputProps {
  text: string;
  isStreaming: boolean;
}

export function StreamOutput({ text, isStreaming }: StreamOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleScroll = useCallback(() => {
    if (scrollTimer.current) return;
    scrollTimer.current = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      scrollTimer.current = null;
    }, 200);
  }, []);

  useEffect(() => {
    if (isStreaming) scheduleScroll();
  }, [text, isStreaming, scheduleScroll]);

  return (
    <ScrollArea className="h-[400px] min-h-[200px] max-h-[500px] rounded-lg forge-terminal">
      <div className="p-4 font-mono text-sm text-zinc-200 whitespace-pre-wrap break-words">
        {text || (
          <span className="text-zinc-600">
            <span className="text-orange-500/60">{'>'}</span> Awaiting forge output...
          </span>
        )}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-orange-500 ember-glow ml-0.5 rounded-sm" />
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
