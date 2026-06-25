import type { SessionInfo, FeedResponse } from '@chemuxer/shared';
import type * as k8s from '@kubernetes/client-node';

export interface ChemuxerClientOptions {
  timeoutMs?: number; // default 2000
  kubeConfig?: k8s.KubeConfig;
}

export class ChemuxerClient {
  private readonly timeoutMs: number;
  private readonly kubeConfig?: k8s.KubeConfig;

  constructor(options: ChemuxerClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.kubeConfig = options.kubeConfig;
  }

  async listSessions(endpoint: string): Promise<SessionInfo[]> {
    return this.get<SessionInfo[]>(`${endpoint}/api/sessions`);
  }

  async getBuffer(endpoint: string, sessionId: string): Promise<string> {
    const result = await this.get<{ content: string }>(
      `${endpoint}/api/sessions/${encodeURIComponent(sessionId)}/buffer`,
    );
    return result.content;
  }

  async sendInput(endpoint: string, sessionId: string, data: string): Promise<void> {
    await this.post(`${endpoint}/api/sessions/${encodeURIComponent(sessionId)}/input`, { data });
  }

  async createSession(endpoint: string): Promise<SessionInfo> {
    return this.post<SessionInfo>(`${endpoint}/api/sessions`, {});
  }

  async closeSession(endpoint: string, sessionId: string): Promise<void> {
    await this.del(`${endpoint}/api/sessions/${encodeURIComponent(sessionId)}`);
  }

  async getFeed(endpoint: string, sessionId?: string, since?: string): Promise<FeedResponse> {
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    const path = sessionId
      ? `${endpoint}/api/sessions/${encodeURIComponent(sessionId)}/feed${params}`
      : `${endpoint}/api/feed${params}`;
    return this.get<FeedResponse>(path);
  }

  private async applyAuthOptions(url: string, init: RequestInit): Promise<RequestInit> {
    if (!this.kubeConfig) return init;
    // Only apply auth for K8s API server URLs (https://)
    // Direct pod IP URLs (http://) don't need auth
    if (!url.startsWith('https://')) return init;

    const opts: { headers: Record<string, string> } = { headers: {} };
    await this.kubeConfig.applyToHTTPSOptions(opts as Parameters<k8s.KubeConfig['applyToHTTPSOptions']>[0]);
    const authHeaders = opts.headers;
    return {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders },
    };
  }

  private async get<T>(url: string): Promise<T> {
    const init = await this.applyAuthOptions(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const res = await fetch(url, init);
    if (!res.ok) throw new UpstreamError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const init = await this.applyAuthOptions(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const res = await fetch(url, init);
    if (!res.ok) throw new UpstreamError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async del(url: string): Promise<void> {
    const init = await this.applyAuthOptions(url, {
      method: 'DELETE',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const res = await fetch(url, init);
    if (!res.ok) throw new UpstreamError(res.status, await res.text());
  }
}

export class UpstreamError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`Upstream returned ${statusCode}: ${body}`);
    this.name = 'UpstreamError';
  }
}
