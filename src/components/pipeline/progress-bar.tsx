'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, Clock, SkipForward } from 'lucide-react';

interface ProgressBarProps {
  stages: Array<{ id: string; displayName: string; status: string; skillName: string }>;
}

export function ProgressBar({ stages }: ProgressBarProps) {
  const [elapsed, setElapsed] = useState(0);

  const completed = stages.filter((s) => s.status === 'approved').length;
  const running = stages.filter((s) => s.status === 'running').length;
  const awaiting = stages.filter((s) => s.status === 'awaiting_approval').length;
  const skipped = stages.filter((s) => s.status === 'skipped').length;
  const total = stages.length;
  const done = completed + skipped;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const currentStage = stages.find((s) => s.status === 'running' || s.status === 'awaiting_approval');

  // Timer
  useEffect(() => {
    if (!currentStage || currentStage.status === 'awaiting_approval') return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [currentStage?.id, currentStage?.status]);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-200">
          {done} of {total} stages complete
        </span>
        <span className="text-sm text-zinc-400">{pct}%</span>
      </div>
      <div className="h-2 bg-zinc-700 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Current stage */}
      {currentStage && (
        <div className="flex items-center gap-3 text-sm">
          {currentStage.status === 'running' ? (
            <Loader2 className="h-4 w-4 text-orange-400 animate-spin shrink-0" />
          ) : (
            <Clock className="h-4 w-4 text-yellow-400 shrink-0" />
          )}
          <span className="text-zinc-300 truncate">
            {currentStage.status === 'running' ? 'Running' : 'Awaiting approval'}:
            {' '}<span className="text-zinc-100 font-medium">{currentStage.displayName}</span>
          </span>
          {currentStage.status === 'running' && elapsed > 0 && (
            <span className="text-zinc-500 ml-auto shrink-0">{formatTime(elapsed)}</span>
          )}
        </div>
      )}

      {/* Stage pills */}
      <div className="flex gap-1 mt-3 flex-wrap">
        {stages.map((stage) => (
          <div
            key={stage.id}
            title={`${stage.displayName} (${stage.status})`}
            className={`h-1.5 rounded-full flex-1 min-w-[8px] max-w-[40px] transition-colors ${
              stage.status === 'approved' ? 'bg-emerald-400' :
              stage.status === 'running' ? 'bg-orange-400 animate-pulse' :
              stage.status === 'awaiting_approval' ? 'bg-yellow-400' :
              stage.status === 'skipped' ? 'bg-zinc-600' :
              stage.status === 'failed' ? 'bg-red-400' :
              'bg-zinc-700'
            }`}
          />
        ))}
      </div>

      {/* Summary counts */}
      <div className="flex gap-4 mt-2 text-xs text-zinc-500">
        {completed > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-emerald-400" /> {completed} approved
          </span>
        )}
        {running > 0 && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 text-orange-400" /> {running} running
          </span>
        )}
        {awaiting > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-yellow-400" /> {awaiting} awaiting
          </span>
        )}
        {skipped > 0 && (
          <span className="flex items-center gap-1">
            <SkipForward className="h-3 w-3 text-zinc-500" /> {skipped} skipped
          </span>
        )}
      </div>
    </div>
  );
}
