'use client';

import { formatDuration } from '@/src/lib/utils';

interface StageTimeChartProps {
  stageDurations: Record<string, number>;
}

export function StageTimeChart({ stageDurations }: StageTimeChartProps) {
  const entries = Object.entries(stageDurations).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No stage duration data yet.</p>;
  }

  const maxDuration = Math.max(...entries.map(([, v]) => v));

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Average Stage Durations</h4>
      {entries.map(([name, duration]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-36 truncate text-right">{name}</span>
          <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-sm transition-all"
              style={{ width: `${(duration / maxDuration) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-16">{formatDuration(duration)}</span>
        </div>
      ))}
    </div>
  );
}
