export interface ApiError {
  error: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface SSEEvent {
  type: 'token' | 'checkpoint' | 'stage_start' | 'stage_complete' | 'error' | 'done';
  data: unknown;
}

export interface TokenEvent {
  type: 'token';
  data: { text: string };
}

export interface CheckpointEvent {
  type: 'checkpoint';
  data: { stageId: string; artifact: string };
}

export interface StageStartEvent {
  type: 'stage_start';
  data: { stageId: string; stageIndex: number; skillName: string; displayName: string };
}

export interface ErrorEvent {
  type: 'error';
  data: { message: string };
}

export interface DoneEvent {
  type: 'done';
  data: Record<string, never>;
}
