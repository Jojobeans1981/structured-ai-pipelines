'use client';

import { Check, X, Loader2, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { type StageState } from '@/src/stores/pipeline-store';

interface StageProgressProps {
  stages: StageState[];
  currentStageIndex: number;
}

const statusConfig: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { color: 'bg-zinc-800 text-zinc-500 border border-zinc-700', icon: Clock },
  running: { color: 'bg-orange-500/20 text-orange-400 border border-orange-500/40 forge-pulse', icon: Loader2 },
  awaiting_approval: { color: 'bg-amber-500/20 text-amber-400 border border-amber-500/40', icon: AlertCircle },
  approved: { color: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', icon: Check },
  rejected: { color: 'bg-red-500/20 text-red-400 border border-red-500/30', icon: X },
  skipped: { color: 'bg-zinc-800 text-zinc-500 border border-zinc-700', icon: X },
};

export function StageProgress({ stages, currentStageIndex }: StageProgressProps) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-center gap-0 min-w-max px-4">
        {stages.map((stage, index) => {
          const config = statusConfig[stage.status] || statusConfig.pending;
          const Icon = config.icon;
          const isRunning = stage.status === 'running';

          return (
            <div key={stage.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium transition-all',
                    config.color
                  )}
                >
                  <Icon className={cn('h-4 w-4', isRunning && 'animate-spin')} />
                </div>
                <span className={cn(
                  'text-xs max-w-[80px] text-center truncate',
                  index <= currentStageIndex ? 'text-zinc-200 font-medium' : 'text-zinc-500'
                )}>
                  {stage.displayName}
                </span>
              </div>
              {index < stages.length - 1 && (
                <div className={cn(
                  'h-0.5 w-12 mx-1 rounded-full transition-all',
                  stage.status === 'approved'
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-sm shadow-orange-500/30'
                    : 'bg-zinc-800'
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
