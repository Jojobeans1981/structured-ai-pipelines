'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Pencil, X, Brain, MessageCircleQuestion } from 'lucide-react';
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

/** Parse Socratic questions from artifact/feedback content */
function parseSocraticQuestions(content: string): Array<{ question: string; defaultAnswer: string }> {
  const questions: Array<{ question: string; defaultAnswer: string }> = [];
  const qPattern = /\*\*Q:\*\*\s*(.+?)(?:\n\*\*A[^*]*\*\*:?\s*(.+?))?(?=\n\*\*Q:\*\*|\n\*\*Suggested|$)/g;
  let match;
  while ((match = qPattern.exec(content)) !== null) {
    questions.push({
      question: match[1].trim(),
      defaultAnswer: match[2]?.trim() || '',
    });
  }
  return questions;
}

export function CheckpointGate({ stage, runId, onApprove, onReject, renderArtifact, approveDisabled, approveTooltip }: CheckpointGateProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(stage.artifactContent || '');

  // Detect Socratic questions in feedback
  const socraticQuestions = useMemo(() => {
    const content = stage.artifactContent || '';
    if (!content.includes('Socratic Clarifications')) return [];
    return parseSocraticQuestions(content);
  }, [stage.artifactContent]);
  const [socraticAnswers, setSocraticAnswers] = useState<Record<number, string>>({});

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

      {/* Socratic Question UI */}
      {socraticQuestions.length > 0 && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 text-sm font-medium">
            <Brain className="h-4 w-4" />
            Socrates has questions to help resolve this issue
          </div>
          {socraticQuestions.map((q, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-start gap-2 text-sm">
                <MessageCircleQuestion className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                <span className="text-zinc-300">{q.question}</span>
              </div>
              <Input
                value={socraticAnswers[i] ?? q.defaultAnswer}
                onChange={(e) => setSocraticAnswers({ ...socraticAnswers, [i]: e.target.value })}
                placeholder={q.defaultAnswer || 'Your answer...'}
                className="text-sm bg-zinc-900/50 border-zinc-700 ml-6"
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="ml-6 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
            onClick={() => {
              const answers = socraticQuestions.map((q, i) =>
                `**Q:** ${q.question}\n**A:** ${socraticAnswers[i] ?? q.defaultAnswer}`
              ).join('\n\n');
              onReject(`USER ANSWERS TO SOCRATIC QUESTIONS:\n\n${answers}\n\nUse these answers to fix the issues and regenerate.`);
            }}
          >
            Submit Answers & Retry
          </Button>
        </div>
      )}

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
