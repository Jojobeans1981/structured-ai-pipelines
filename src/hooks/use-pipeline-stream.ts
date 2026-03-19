'use client';

import { useRef, useCallback } from 'react';
import { usePipelineStore } from '@/src/stores/pipeline-store';

export function usePipelineStream(runId: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const { appendToken, setCheckpoint, setError, setCompleted } = usePipelineStore();

  const connect = useCallback(() => {
    if (!runId || eventSourceRef.current) return;

    const es = new EventSource(`/api/pipeline/${runId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        switch (parsed.type) {
          case 'token':
            appendToken(parsed.data.text);
            break;
          case 'checkpoint':
            setCheckpoint(parsed.data.stageId, parsed.data.artifact);
            es.close();
            eventSourceRef.current = null;
            break;
          case 'error':
            setError(parsed.data.message);
            es.close();
            eventSourceRef.current = null;
            break;
          case 'done':
            setCompleted();
            es.close();
            eventSourceRef.current = null;
            break;
        }
      } catch {
        // Ignore parse errors on SSE
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [runId, appendToken, setCheckpoint, setError, setCompleted]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  return { connect, disconnect };
}
