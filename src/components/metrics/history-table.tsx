'use client';

import { useState } from 'react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDate, formatDuration } from '@/src/lib/utils';
import { type MetricHistoryEntry } from '@/src/types/metrics';

interface HistoryTableProps {
  history: MetricHistoryEntry[];
  onLoadMore?: () => void;
}

const outcomeColors: Record<string, string> = {
  success: 'bg-green-500/10 text-green-600',
  failure: 'bg-red-500/10 text-red-600',
  cancelled: 'bg-gray-500/10 text-gray-600',
};

export function HistoryTable({ history, onLoadMore }: HistoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No pipeline runs yet.</p>;
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
        <span>Date</span>
        <span>Project</span>
        <span>Type</span>
        <span>Duration</span>
        <span>Outcome</span>
        <span>Stages</span>
        <span>First-Pass</span>
      </div>

      {history.map((entry) => {
        const expanded = expandedId === entry.id;
        const firstPassPct = entry.stageCount > 0
          ? Math.round((entry.approvedFirstPass / entry.stageCount) * 100)
          : 0;

        return (
          <div key={entry.id}>
            <button
              className="grid grid-cols-7 gap-2 w-full px-3 py-2 text-sm rounded hover:bg-accent/50 text-left"
              onClick={() => setExpandedId(expanded ? null : entry.id)}
            >
              <span className="text-muted-foreground">{formatDate(entry.createdAt)}</span>
              <span className="truncate">{entry.projectName}</span>
              <span><Badge variant="secondary" className="text-xs">{entry.pipelineType}</Badge></span>
              <span>{formatDuration(entry.totalDurationMs)}</span>
              <span><Badge variant="outline" className={outcomeColors[entry.outcome] || ''}>{entry.outcome}</Badge></span>
              <span>{entry.stageCount}</span>
              <span className="flex items-center gap-1">
                {firstPassPct}%
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </span>
            </button>

            {expanded && (
              <div className="px-3 py-2 ml-4 mb-2 text-xs border-l-2 border-muted space-y-1">
                <p className="font-medium">Stage Breakdown:</p>
                {Object.entries(entry.stageDurations).map(([name, ms]) => (
                  <div key={name} className="flex justify-between max-w-xs">
                    <span className="text-muted-foreground">{name}</span>
                    <span>{formatDuration(ms)}</span>
                  </div>
                ))}
                {entry.rejectionCount > 0 && (
                  <p className="text-yellow-600">{entry.rejectionCount} stage(s) rejected and re-run</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {onLoadMore && (
        <Button variant="ghost" size="sm" onClick={onLoadMore} className="w-full mt-2">
          Load More
        </Button>
      )}
    </div>
  );
}
