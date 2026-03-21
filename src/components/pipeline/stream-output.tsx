'use client';

import { useRef, useEffect } from 'react';

interface StreamOutputProps {
  text: string;
  isStreaming: boolean;
}

export function StreamOutput({ text, isStreaming }: StreamOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll only within the container — never moves the page
  useEffect(() => {
    if (!isStreaming || !containerRef.current) return;
    if (scrollTimer.current) return;
    scrollTimer.current = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
      scrollTimer.current = null;
    }, 300);
  }, [text, isStreaming]);

  return (
    <div
      ref={containerRef}
      className="h-[400px] max-h-[500px] overflow-y-auto rounded-lg forge-terminal"
    >
      <div className="p-4 font-mono text-sm text-zinc-200 whitespace-pre-wrap break-words">
        {text || (
          <span className="text-zinc-600">
            <span className="text-orange-500/60">{'>'}</span> Awaiting forge output...
          </span>
        )}
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-orange-500 ember-glow ml-0.5 rounded-sm" />
        )}
      </div>
    </div>
  );
}
