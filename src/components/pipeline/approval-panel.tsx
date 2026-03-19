'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Check, X, Loader2, MessageSquare, Flame } from 'lucide-react';

interface ApprovalPanelProps {
  stageId: string;
  runId: string;
  onApprove: (editedContent?: string) => Promise<void>;
  onReject: (feedback: string) => Promise<void>;
  /** Disable the approve button (e.g. educator quiz not passed) */
  approveDisabled?: boolean;
  /** Tooltip when approve is disabled */
  approveTooltip?: string;
}

export function ApprovalPanel({ stageId, runId, onApprove, onReject, approveDisabled, approveTooltip }: ApprovalPanelProps) {
  const [mode, setMode] = useState<'default' | 'respond' | 'reject'>('default');
  const [feedback, setFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await onApprove();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) return;
    setIsLoading(true);
    try {
      await onReject(feedback.trim());
      setFeedback('');
      setMode('default');
    } finally {
      setIsLoading(false);
    }
  };

  if (mode === 'respond' || mode === 'reject') {
    const isRespond = mode === 'respond';
    return (
      <div className="space-y-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
        <p className="text-sm font-medium text-zinc-200">
          {isRespond ? 'Your response:' : 'Feedback for re-generation:'}
        </p>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={isRespond
            ? "Answer the question or provide the requested information..."
            : "What should be changed or improved?"
          }
          rows={3}
          disabled={isLoading}
          className="bg-zinc-900/50 border-zinc-700 focus:border-orange-500/50"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && feedback.trim()) {
              handleSubmitFeedback();
            }
            if (e.key === 'Escape') {
              setMode('default');
              setFeedback('');
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleSubmitFeedback} disabled={isLoading || !feedback.trim()} size="sm">
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isRespond ? (
              <Flame className="mr-2 h-4 w-4" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            {isRespond ? 'Send & Re-forge' : 'Submit & Re-forge'}
          </Button>
          <Button onClick={() => { setMode('default'); setFeedback(''); }} variant="outline" size="sm" disabled={isLoading}>
            Cancel
          </Button>
          <span className="text-xs text-zinc-500 ml-auto">Ctrl+Enter to submit</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        onClick={handleApprove}
        disabled={isLoading || approveDisabled}
        size="sm"
        title={approveDisabled ? approveTooltip : undefined}
      >
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
        {approveDisabled ? 'Complete Quiz to Approve' : 'Approve & Continue'}
      </Button>
      <Button onClick={() => setMode('respond')} variant="outline" size="sm" disabled={isLoading}>
        <MessageSquare className="mr-2 h-4 w-4" /> Respond
      </Button>
      <Button onClick={() => setMode('reject')} variant="destructive" size="sm" disabled={isLoading}>
        <X className="mr-2 h-4 w-4" /> Reject
      </Button>
    </div>
  );
}
