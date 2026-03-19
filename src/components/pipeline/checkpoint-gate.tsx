'use client';

import { useState } from 'react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Pencil, X } from 'lucide-react';
import { formatDuration } from '@/src/lib/utils';
import { type StageState } from '@/src/stores/pipeline-store';
import { ArtifactViewer } from '@/src/components/pipeline/artifact-viewer';
import { ApprovalPanel } from '@/src/components/pipeline/approval-panel';

interface CheckpointGateProps {
  stage: StageState;
  runId: string;
  onApprove: (editedContent?: string) => Promise<void>;
  onReject: (feedback: string) => Promise<void>;
  renderArtifact?: (content: string) => React.ReactNode;
  /** Disable the approve button (e.g. educator quiz not passed yet) */
  approveDisabled?: boolean;
  /** Tooltip when approve is disabled */
  approveTooltip?: string;
}

export function CheckpointGate({ stage, runId, onApprove, onReject, renderArtifact, approveDisabled, approveTooltip }: CheckpointGateProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(stage.artifactContent || '');

  const handleApprove = async (content?: string) => {
    const finalContent = isEditing ? editedContent : content;
    await onApprove(finalContent !== stage.artifactContent ? finalContent : undefined);
    setIsEditing(false);
  };

  return (
    <div className="space-y-4 rounded-lg border border-orange-500/15 bg-zinc-900/50 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-zinc-100">
            Stage {stage.stageIndex + 1}: {stage.displayName}
          </h3>
          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
            Review Required
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {stage.durationMs && (
            <Badge variant="secondary">{formatDuration(stage.durationMs)}</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsEditing(!isEditing);
              setEditedContent(stage.artifactContent || '');
            }}
          >
            {isEditing ? <X className="mr-1 h-4 w-4" /> : <Pencil className="mr-1 h-4 w-4" />}
            {isEditing ? 'Cancel Edit' : 'Edit'}
          </Button>
        </div>
      </div>

      <div className="max-h-[500px] overflow-auto">
        {isEditing ? (
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="min-h-[300px] font-mono text-sm bg-zinc-900/50 border-zinc-700"
          />
        ) : stage.artifactContent ? (
          renderArtifact ? renderArtifact(stage.artifactContent) : <ArtifactViewer content={stage.artifactContent} />
        ) : (
          <p className="text-zinc-500">No artifact content</p>
        )}
      </div>

      <ApprovalPanel
        stageId={stage.id}
        runId={runId}
        onApprove={handleApprove}
        onReject={onReject}
        approveDisabled={approveDisabled}
        approveTooltip={approveTooltip}
      />
    </div>
  );
}
