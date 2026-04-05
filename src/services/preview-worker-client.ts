interface PreviewWorkerFile {
  filePath: string;
  content: string;
}

interface WorkerLaunchResponse {
  success: boolean;
  url: string | null;
  containerId: string | null;
  port: number | null;
  expiresAt: string | null;
  error: string | null;
}

interface WorkerHealthResponse {
  status: string;
  dockerAvailable: boolean;
  reason: string | null;
}

interface WorkerAvailability {
  available: boolean;
  reason: string | null;
}

interface WorkerStatusResponse {
  found: boolean;
  status: string;
  running: boolean;
  previewUrl: string | null;
  expiresAt: string | null;
  error: string | null;
  logs: string;
}

interface WorkerRequestOptions extends RequestInit {
  timeoutMs?: number;
}

function getWorkerBaseUrl(): string | null {
  const value = process.env.PREVIEW_WORKER_URL?.trim();
  return value || null;
}

function getWorkerToken(): string | null {
  const value = process.env.PREVIEW_WORKER_TOKEN?.trim();
  return value || null;
}

async function requestWorker<T>(path: string, init?: WorkerRequestOptions): Promise<T> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    throw new Error('Preview worker is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 15000);
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  const token = getWorkerToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data?.error === 'string'
        ? data.error
        : typeof data?.detail === 'string'
          ? data.detail
          : `Preview worker request failed with ${response.status}`;
      throw new Error(message);
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Preview worker request timed out.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class PreviewWorkerClient {
  static isConfigured(): boolean {
    return !!getWorkerBaseUrl();
  }

  static async getAvailability(): Promise<WorkerAvailability> {
    if (!PreviewWorkerClient.isConfigured()) {
      return { available: false, reason: 'Preview worker is not configured.' };
    }

    try {
      const data = await requestWorker<WorkerHealthResponse>('/health', { method: 'GET' });
      return {
        available: !!data.dockerAvailable,
        reason: data.dockerAvailable ? null : data.reason || 'Preview worker cannot access Docker.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview worker is unreachable.';
      return { available: false, reason: message };
    }
  }

  static async launchPreview(
    files: PreviewWorkerFile[],
    ttlSeconds: number,
    projectId: string
  ): Promise<WorkerLaunchResponse> {
    return requestWorker<WorkerLaunchResponse>('/preview/launch', {
      method: 'POST',
      body: JSON.stringify({ files, ttlSeconds, projectId }),
      timeoutMs: 90000,
    });
  }

  static async stopPreview(containerId: string): Promise<void> {
    await requestWorker('/preview/stop', {
      method: 'POST',
      body: JSON.stringify({ containerId }),
    });
  }

  static async getStatus(containerId: string): Promise<WorkerStatusResponse> {
    return requestWorker<WorkerStatusResponse>(`/preview/status/${containerId}`, {
      method: 'GET',
      timeoutMs: 10000,
    });
  }
}
