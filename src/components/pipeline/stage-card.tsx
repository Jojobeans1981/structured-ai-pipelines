'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDuration } from '@/src/lib/utils';
import { type StageState } from '@/src/stores/pipeline-store';
import { ArtifactViewer } from '@/src/components/pipeline/artifact-viewer';

interface StageCardProps {
  stage: StageState;
}

const statusBadge: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  approved: { variant: 'default', label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
  skipped: { variant: 'secondary', label: 'Skipped' },
};

export function StageCard({ stage }: StageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = statusBadge[stage.status] || { variant: 'outline' as const, label: stage.status };

  return (
    <Card className="transition-colors">
      <CardHeader
        className="flex cursor-pointer flex-row items-center justify-between space-y-0 py-3 px-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="text-sm font-medium">
            Stage {stage.stageIndex + 1}: {stage.displayName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stage.durationMs && (
            <span className="text-xs text-muted-foreground">{formatDuration(stage.durationMs)}</span>
          )}
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </CardHeader>
      {expanded && stage.artifactContent && (
        <CardContent className="pt-0 pb-4 px-4">
          <div className="max-h-[400px] overflow-auto rounded border p-4">
            <ArtifactViewer content={stage.artifactContent} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
