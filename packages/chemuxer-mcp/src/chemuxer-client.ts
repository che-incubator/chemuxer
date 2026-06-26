import type { SessionInfo, FeedResponse } from '@chemuxer/shared';

export interface ChemuxerClientOptions {
  timeoutMs?: number; // default 2000
}

export class ChemuxerClient {
  private readonly timeoutMs: number;

  constructor(options: ChemuxerClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 2000;
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

  async createSession(endpoint: string, opts?: { pinned?: boolean }): Promise<SessionInfo> {
    const body: Record<string, unknown> = {};
    if (opts?.pinned) body.pinned = true;
    return this.post<SessionInfo>(`${endpoint}/api/sessions`, body);
  }

  async closeSession(endpoint: string, sessionId: string, opts?: { force?: boolean }): Promise<void> {
    const query = opts?.force ? '?force=true' : '';
    await this.del(`${endpoint}/api/sessions/${encodeURIComponent(sessionId)}${query}`);
  }

  async getFeed(endpoint: string, sessionId?: string, since?: string): Promise<FeedResponse> {
    const params = since ? `?since=${encodeURIComponent(since)}` : '';
    const path = sessionId
      ? `${endpoint}/api/sessions/${encodeURIComponent(sessionId)}/feed${params}`
      : `${endpoint}/api/feed${params}`;
    return this.get<FeedResponse>(path);
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new UpstreamError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new UpstreamError(res.status, await res.text());
    return res.json() as Promise<T>;
  }

  private async del(url: string): Promise<void> {
    const res = await fetch(url, {
      method: 'DELETE',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
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
