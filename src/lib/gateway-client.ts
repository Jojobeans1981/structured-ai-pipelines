/**
 * Gateway Client — thin wrapper for calling the Gauntlet Forge API gateway.
 *
 * Used by the Next.js frontend to communicate with the FastAPI gateway
 * instead of calling Next.js API routes directly.
 *
 * Falls back to direct Next.js API calls when NEXT_PUBLIC_GATEWAY_URL is not set.
 */

const GATEWAY_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_GATEWAY_URL || '')
  : '';

function getBaseUrl(): string {
  // If no gateway URL configured, fall back to same-origin (Next.js API)
  return GATEWAY_URL || '';
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // If we have a JWT token stored (from gateway OAuth), include it
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('forge_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

export const gatewayClient = {
  /** GET request to gateway or fallback to local API */
  async get<T = unknown>(path: string): Promise<T> {
    const base = getBaseUrl();
    const url = base ? `${base}/api/v1${path}` : `/api${path}`;
    const resp = await fetch(url, { headers: getAuthHeaders(), credentials: 'include' });
    if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status}`);
    return resp.json();
  },

  /** POST request */
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const base = getBaseUrl();
    const url = base ? `${base}/api/v1${path}` : `/api${path}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) throw new Error(`POST ${path} failed: ${resp.status}`);
    return resp.json();
  },

  /** DELETE request */
  async delete<T = unknown>(path: string): Promise<T> {
    const base = getBaseUrl();
    const url = base ? `${base}/api/v1${path}` : `/api${path}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!resp.ok) throw new Error(`DELETE ${path} failed: ${resp.status}`);
    return resp.json();
  },

  /** SSE stream URL (for EventSource) */
  streamUrl(path: string): string {
    const base = getBaseUrl();
    return base ? `${base}/api/v1${path}` : `/api${path}`;
  },

  /** Health check */
  async health(): Promise<{ gateway: boolean; engine: unknown }> {
    const base = getBaseUrl();
    if (!base) return { gateway: false, engine: null };
    const resp = await fetch(`${base}/health`);
    return resp.json();
  },

  /** Check if gateway mode is active */
  isGatewayMode(): boolean {
    return Boolean(getBaseUrl());
  },
};
