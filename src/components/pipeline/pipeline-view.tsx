'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { XCircle, CheckCircle2, AlertTriangle, Loader2, Flame, FolderOpen } from 'lucide-react';
import { usePipelineStore, type StageState } from '@/src/stores/pipeline-store';
import { usePipelineStream } from '@/src/hooks/use-pipeline-stream';
import { StageProgress } from '@/src/components/pipeline/stage-progress';
import { StreamOutput } from '@/src/components/pipeline/stream-output';
import { CheckpointGate } from '@/src/components/pipeline/checkpoint-gate';
import { StageCard } from '@/src/components/pipeline/stage-card';
import { RootCauseDisplay } from '@/src/components/pipeline/root-cause-display';
import { FixDiffViewer } from '@/src/components/pipeline/fix-diff-viewer';
import { DAGView } from '@/src/components/pipeline/dag-view';
import { PlanApproval } from '@/src/components/pipeline/plan-approval';
import { CostDisplay } from '@/src/components/pipeline/cost-display';
import { TraceTimeline } from '@/src/components/pipeline/trace-timeline';
import { BuildSummaryPanel } from '@/src/components/pipeline/build-summary';
import { ProgressBar } from '@/src/components/pipeline/progress-bar';
import { useKeyboardShortcuts } from '@/src/hooks/use-keyboard-shortcuts';

interface PipelineViewProps {
  runId: string;
  projectId: string;
}

export function PipelineView({ runId, projectId }: PipelineViewProps) {
  const router = useRouter();
  const store = usePipelineStore();
  const { connect, disconnect } = usePipelineStream(runId);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  // Shared function to load/reload run state from the server
  const reloadRunState = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/${runId}`);
      if (!res.ok) throw new Error('Failed to load pipeline run');
      const { data: run } = await res.json();

      const stages: StageState[] = run.stages.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        stageIndex: s.stageIndex as number,
        skillName: s.skillName as string,
        displayName: s.displayName as string,
        status: s.status as StageState['status'],
        artifactContent: (s.artifactContent as string) || null,
        streamContent: (s.streamContent as string) || null,
        durationMs: (s.durationMs as number) || null,
        nodeId: (s.nodeId as string) || null,
        nodeType: (s.nodeType as string) || null,
        dependsOn: (s.dependsOn as string[]) || [],
        parallelGroup: (s.parallelGroup as string) || null,
        gateType: (s.gateType as string) || null,
        phaseIndex: (s.phaseIndex as number) ?? null,
        retryCount: (s.retryCount as number) || 0,
      }));

      store.initRun(
        runId, projectId, run.type, stages,
        run.executionMode, run.planApproved,
        run.executionPlan, run.outputPath
      );
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to load run');
    }
  }, [runId, projectId, store]);

  // Load run data on mount
  useEffect(() => {
    reloadRunState();

    return () => {
      disconnect();
      // Close all DAG event sources
      eventSourcesRef.current.forEach((es) => es.close());
      eventSourcesRef.current.clear();
      store.reset();
    };
  }, [runId, projectId]);

  // Linear mode: auto-connect to running stage
  useEffect(() => {
    if (store.executionMode !== 'linear') return;
    const runningStage = store.stages.find((s) => s.status === 'running');
    if (runningStage && store.status === 'running') {
      connect();
    }
  }, [store.stages, store.status, store.executionMode, connect]);

  // DAG mode: connect SSE to each running node
  useEffect(() => {
    if (store.executionMode !== 'dag' || store.status !== 'running') return;

    const runningNodes = store.stages.filter((s) => s.status === 'running' && s.nodeType !== 'gate');

    for (const node of runningNodes) {
      if (eventSourcesRef.current.has(node.id)) continue;

      const es = new EventSource(`/api/pipeline/${runId}/nodes/${node.id}/stream`);
      eventSourcesRef.current.set(node.id, es);

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          switch (parsed.type) {
            case 'token':
              if (activeNodeId === node.id || !activeNodeId) {
                store.appendToken(parsed.data.text, node.id);
              }
              break;
            case 'checkpoint':
              store.setCheckpoint(parsed.data.stageId, parsed.data.artifact);
              es.close();
              eventSourcesRef.current.delete(node.id);
              break;
            case 'auto-fix':
              // Auto-fix cycle triggered — reload run state to pick up reset stages
              es.close();
              eventSourcesRef.current.delete(node.id);
              reloadRunState();
              break;
            case 'error':
              store.setError(parsed.data.message);
              es.close();
              eventSourcesRef.current.delete(node.id);
              break;
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        eventSourcesRef.current.delete(node.id);
      };
    }
  }, [store.stages, store.status, store.executionMode, runId, activeNodeId]);

  // Approve handler (works for both modes)
  const handleApprove = useCallback(async (stageId: string, editedContent?: string) => {
    disconnect();
    const es = eventSourcesRef.current.get(stageId);
    if (es) { es.close(); eventSourcesRef.current.delete(stageId); }

    try {
      const res = await fetch(`/api/pipeline/${runId}/stages/${stageId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedContent }),
      });
      if (!res.ok) throw new Error('Failed to approve stage');
      const data = await res.json();

      // DAG mode: server tells us which nodes are now running
      const nextRunningIds = data.data?.nextNodes?.map((n: { id: string }) => n.id) || [];

      // Pause to let the browser breathe before next stage
      await new Promise((resolve) => setTimeout(resolve, 800));

      store.approveStage(stageId, store.executionMode === 'dag' ? nextRunningIds : undefined);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Approval failed');
    }
  }, [runId, disconnect, store]);

  // Reject handler
  const handleReject = useCallback(async (stageId: string, feedback: string) => {
    disconnect();
    const es = eventSourcesRef.current.get(stageId);
    if (es) { es.close(); eventSourcesRef.current.delete(stageId); }

    try {
      const res = await fetch(`/api/pipeline/${runId}/stages/${stageId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      if (!res.ok) throw new Error('Failed to reject stage');
      store.rejectStage(stageId);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Rejection failed');
    }
  }, [runId, disconnect, store]);

  // Plan approval handler (DAG mode)
  const handleApprovePlan = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/${runId}/plan/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve plan');
      const { data } = await res.json();
      store.setPlanApproved(data.nextNodes?.map((n: { id: string }) => n.id) || []);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Plan approval failed');
    }
  }, [runId, store]);

  // Cancel handler
  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this pipeline run?')) return;
    disconnect();
    eventSourcesRef.current.forEach((es) => es.close());
    eventSourcesRef.current.clear();
    try {
      const res = await fetch(`/api/pipeline/${runId}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to cancel');
      store.setCancelled();
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Cancel failed');
    }
  }, [runId, disconnect, store]);

  const completedStages = store.stages.filter((s) => s.status === 'approved');
  const currentStage = store.stages.find((s) => s.status === 'running' || s.status === 'awaiting_approval');
  const awaitingStages = store.stages.filter((s) => s.status === 'awaiting_approval');
  const isDAG = store.executionMode === 'dag';

  // Keyboard shortcuts
  useKeyboardShortcuts({
    'enter': () => {
      if (store.status === 'paused' && currentStage?.status === 'awaiting_approval') {
        handleApprove(currentStage.id);
      }
    },
    'ctrl+shift+c': () => {
      if (store.status !== 'idle' && store.status !== 'completed') {
        handleCancel();
      }
    },
  }, store.status === 'running' || store.status === 'paused' || store.status === 'planning');

  return (
    <div className="space-y-6">
      {/* DAG Mode: Plan Approval */}
      {isDAG && store.status === 'planning' && !store.planApproved && (
        <PlanApproval
          runId={runId}
          nodes={store.stages}
          executionPlan={store.executionPlan as { type: string; estimatedPhases: number; parallelGroups: string[] } | null}
          onApprove={handleApprovePlan}
        />
      )}

      {/* Progress bar (shown during execution) */}
      {store.stages.length > 0 && store.planApproved && store.status !== 'completed' && store.status !== 'cancelled' && (
        <ProgressBar stages={store.stages} />
      )}

      {/* DAG Mode: Graph View (shown during execution) */}
      {isDAG && store.planApproved && (
        <DAGView
          nodes={store.stages}
          onNodeClick={(nodeId) => setActiveNodeId(nodeId === activeNodeId ? null : nodeId)}
          activeNodeId={activeNodeId}
        />
      )}

      {/* Linear Mode: Stage Progress Bar */}
      {!isDAG && (
        <StageProgress stages={store.stages} currentStageIndex={store.currentStageIndex} />
      )}

      {/* Completed stages (collapsed) */}
      {completedStages.length > 0 && !isDAG && (
        <div className="space-y-2">
          {completedStages.map((stage) => (
            <StageCard key={stage.id} stage={stage} />
          ))}
        </div>
      )}

      {/* DAG Mode: Show selected node detail */}
      {isDAG && activeNodeId && (() => {
        const node = store.stages.find((s) => s.id === activeNodeId);
        if (!node) return null;
        if (node.status === 'approved' && node.artifactContent) {
          return <StageCard key={node.id} stage={node} />;
        }
        return null;
      })()}

      {/* Streaming output for running stage(s) */}
      {store.status === 'running' && store.isStreaming && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
            <span className="text-sm font-medium text-zinc-200">
              {isDAG
                ? `Forging: ${store.stages.find((s) => s.id === store.streamingNodeId)?.displayName || 'Processing...'}`
                : `Stage ${(currentStage?.stageIndex || 0) + 1}: ${currentStage?.displayName}`
              }
            </span>
          </div>
          <StreamOutput text={store.streamingText} isStreaming={store.isStreaming} />
        </div>
      )}

      {/* Checkpoint gate — only show ONE at a time */}
      {awaitingStages.slice(0, 1).map((stage) => (
        <div key={stage.id} className="space-y-4">
          <CheckpointGate
            stage={stage}
            runId={runId}
            onApprove={(edited) => handleApprove(stage.id, edited)}
            onReject={(feedback) => handleReject(stage.id, feedback)}
            renderArtifact={
              store.pipelineType === 'diagnostic'
                ? (content: string) => {
                    if (stage.skillName === 'root-cause-analyzer') {
                      return <RootCauseDisplay artifactContent={content} />;
                    }
                    if (stage.skillName === 'fix-executor') {
                      return <FixDiffViewer artifactContent={content} />;
                    }
                    return undefined;
                  }
                : undefined
            }
          />
        </div>
      ))}

      {/* Pipeline Complete */}
      {store.status === 'completed' && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <h3 className="text-lg font-semibold text-zinc-100">Forge Complete</h3>
            <p className="text-sm text-zinc-400">All stages completed successfully.</p>
            {store.outputPath && (
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                Output: {store.outputPath}
              </p>
            )}
            <div className="flex gap-2 mt-2">
              <Button variant="outline" onClick={() => router.push(`/projects/${projectId}`)}>
                Back to Project
              </Button>
              <Button onClick={() => router.push(`/projects/${projectId}`)}>
                <Flame className="mr-2 h-4 w-4" />
                View Generated Files
              </Button>
            </div>
          </div>
          <CostDisplay runId={runId} />
          <BuildSummaryPanel runId={runId} />
          <TraceTimeline runId={runId} />
        </div>
      )}

      {/* Pipeline Failed */}
      {store.status === 'failed' && (
        <TraceTimeline runId={runId} />
      )}
      {store.status === 'failed' && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <h3 className="text-lg font-semibold text-zinc-100">Forge Failed</h3>
          <p className="text-sm text-red-400">{store.error}</p>
        </div>
      )}

      {/* Pipeline Cancelled */}
      {store.status === 'cancelled' && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-zinc-700 p-8 text-center">
          <XCircle className="h-10 w-10 text-zinc-500" />
          <h3 className="text-lg font-semibold text-zinc-300">Forge Cancelled</h3>
        </div>
      )}

      {/* Live trace timeline for running pipelines */}
      {(store.status === 'running' || store.status === 'paused') && (
        <TraceTimeline runId={runId} />
      )}

      {/* Cancel button */}
      {(store.status === 'running' || store.status === 'paused' || store.status === 'planning') && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            <XCircle className="mr-2 h-4 w-4" /> Cancel Pipeline
          </Button>
        </div>
      )}
    </div>
  );
}
