import { create } from 'zustand';

export interface StageState {
  id: string;
  stageIndex: number;
  skillName: string;
  displayName: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'rejected' | 'skipped' | 'failed' | 'retrying';
  artifactContent: string | null;
  streamContent: string | null;
  durationMs: number | null;
  // DAG fields
  nodeId: string | null;
  nodeType: string | null;
  dependsOn: string[];
  parallelGroup: string | null;
  gateType: string | null;
  phaseIndex: number | null;
  retryCount: number;
}

interface PipelineState {
  runId: string | null;
  projectId: string | null;
  pipelineType: 'build' | 'diagnostic' | 'refactor' | null;
  executionMode: 'linear' | 'dag';
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'planning';
  stages: StageState[];
  currentStageIndex: number;
  streamingText: string;
  streamingNodeId: string | null;
  isStreaming: boolean;
  error: string | null;
  planApproved: boolean;
  executionPlan: Record<string, unknown> | null;
  outputPath: string | null;

  initRun: (runId: string, projectId: string, type: string, stages: StageState[], mode?: string, planApproved?: boolean, plan?: Record<string, unknown> | null, outputPath?: string | null) => void;
  appendToken: (text: string, nodeId?: string) => void;
  setCheckpoint: (stageId: string, artifact: string) => void;
  approveStage: (stageId: string, nextRunningIds?: string[]) => void;
  rejectStage: (stageId: string) => void;
  setRunning: (stageId: string) => void;
  setPlanApproved: (nextRunningIds: string[]) => void;
  setError: (message: string) => void;
  setCompleted: () => void;
  setCancelled: () => void;
  updateStages: (stages: StageState[]) => void;
  reset: () => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  runId: null,
  projectId: null,
  pipelineType: null,
  executionMode: 'linear',
  status: 'idle',
  stages: [],
  currentStageIndex: 0,
  streamingText: '',
  streamingNodeId: null,
  isStreaming: false,
  error: null,
  planApproved: false,
  executionPlan: null,
  outputPath: null,

  initRun: (runId, projectId, type, stages, mode, planApproved, plan, outputPath) =>
    set({
      runId,
      projectId,
      pipelineType: type as PipelineState['pipelineType'],
      executionMode: (mode || 'linear') as 'linear' | 'dag',
      stages,
      status: mode === 'dag' && !planApproved ? 'planning' : 'running',
      currentStageIndex: 0,
      streamingText: '',
      streamingNodeId: null,
      isStreaming: false,
      error: null,
      planApproved: planApproved || false,
      executionPlan: plan || null,
      outputPath: outputPath || null,
    }),

  appendToken: (() => {
    let buffer = '';
    let timer: ReturnType<typeof setTimeout> | null = null;

    return (text: string, nodeId?: string) => {
      buffer += text;
      if (!timer) {
        timer = setTimeout(() => {
          const flushed = buffer;
          buffer = '';
          timer = null;
          set((state) => ({
            streamingText: state.streamingText + flushed,
            streamingNodeId: nodeId || state.streamingNodeId,
            isStreaming: true,
          }));
        }, 100); // Flush every 100ms — prevents thousands of re-renders
      }
    };
  })(),

  setCheckpoint: (stageId, artifact) =>
    set((state) => ({
      isStreaming: false,
      streamingNodeId: null,
      status: 'paused' as const,
      stages: state.stages.map((s) =>
        s.id === stageId ? { ...s, status: 'awaiting_approval' as const, artifactContent: artifact, streamContent: state.streamingText } : s
      ),
    })),

  approveStage: (stageId, nextRunningIds) =>
    set((state) => {
      const newStages = state.stages.map((s) => {
        if (s.id === stageId) return { ...s, status: 'approved' as const };
        if (nextRunningIds?.includes(s.id)) return { ...s, status: 'running' as const };
        return s;
      });

      const allDone = newStages.every((s) => s.status === 'approved' || s.status === 'skipped');
      const hasRunning = newStages.some((s) => s.status === 'running');

      // For linear mode, advance to next stage
      if (state.executionMode === 'linear' && !nextRunningIds) {
        const stageIndex = newStages.findIndex((s) => s.id === stageId);
        const nextIndex = stageIndex + 1;
        const isLast = nextIndex >= newStages.length;

        return {
          stages: newStages.map((s, i) => {
            if (s.id === stageId) return { ...s, status: 'approved' as const };
            if (i === nextIndex && !isLast) return { ...s, status: 'running' as const };
            return s;
          }),
          currentStageIndex: isLast ? state.currentStageIndex : nextIndex,
          status: isLast ? ('completed' as const) : ('running' as const),
          streamingText: '',
          isStreaming: false,
        };
      }

      return {
        stages: newStages,
        status: allDone ? ('completed' as const) : hasRunning ? ('running' as const) : ('paused' as const),
        streamingText: '',
        isStreaming: false,
        streamingNodeId: null,
      };
    }),

  rejectStage: (stageId) =>
    set((state) => ({
      stages: state.stages.map((s) =>
        s.id === stageId ? { ...s, status: 'running' as const, artifactContent: null, streamContent: null } : s
      ),
      status: 'running' as const,
      streamingText: '',
      streamingNodeId: null,
      isStreaming: false,
    })),

  setRunning: (stageId) =>
    set((state) => ({
      stages: state.stages.map((s) =>
        s.id === stageId ? { ...s, status: 'running' as const } : s
      ),
      status: 'running' as const,
      streamingText: '',
      streamingNodeId: null,
      isStreaming: false,
    })),

  setPlanApproved: (nextRunningIds) =>
    set((state) => ({
      planApproved: true,
      status: 'running' as const,
      stages: state.stages.map((s) =>
        nextRunningIds.includes(s.id) ? { ...s, status: 'running' as const } : s
      ),
    })),

  setError: (message) => set({ error: message, isStreaming: false, streamingNodeId: null, status: 'failed' as const }),

  setCompleted: () => set({ status: 'completed' as const, isStreaming: false, streamingNodeId: null }),

  setCancelled: () => set({ status: 'cancelled' as const, isStreaming: false, streamingNodeId: null }),

  updateStages: (stages) => set({ stages }),

  reset: () => set({
    runId: null, projectId: null, pipelineType: null, executionMode: 'linear',
    status: 'idle', stages: [], currentStageIndex: 0, streamingText: '',
    streamingNodeId: null, isStreaming: false, error: null, planApproved: false,
    executionPlan: null, outputPath: null,
  }),
}));
