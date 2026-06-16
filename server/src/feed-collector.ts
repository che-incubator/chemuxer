import type { SessionManager } from './session-manager.js';
import { stripAnsi } from './strip-ansi.js';

export interface FeedEntry {
  timestamp: string;
  sessionId: string;
  content: string;
}

export interface FeedResponse {
  entries: FeedEntry[];
  nextSince: string;
}

export interface FeedCollectorOptions {
  intervalMs?: number;
  maxEntries?: number;
  staleMs?: number;
}

export class FeedCollector {
  private entries = new Map<string, FeedEntry[]>();
  private lastSnapshot = new Map<string, string>();
  private lastSeen = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly maxEntries: number;
  private readonly staleMs: number;
  private lastTimestamp: string = new Date(0).toISOString();
  private dirtySessionIds = new Set<string>();
  private disposeListeners = new Map<string, () => void>();

  constructor(
    private manager: SessionManager,
    options: FeedCollectorOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? 60_000;
    this.maxEntries = options.maxEntries ?? 60;
    this.staleMs = options.staleMs ?? 5 * 60_000;
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const dispose of this.disposeListeners.values()) {
      dispose();
    }
    this.disposeListeners.clear();
  }

  tick(): void {
    const sessions = this.manager.listSessions();
    const activeIds = new Set(sessions.map(s => s.id));

    const now = Date.now();
    for (const id of activeIds) {
      this.lastSeen.set(id, now);
    }

    // Register onData listeners for new sessions
    for (const info of sessions) {
      if (!this.disposeListeners.has(info.id)) {
        const session = this.manager.getSession(info.id);
        if (session) {
          const dispose = session.onData(() => {
            this.dirtySessionIds.add(info.id);
          });
          this.disposeListeners.set(info.id, dispose);
          // Mark new sessions as dirty so their first tick is processed
          this.dirtySessionIds.add(info.id);
        }
      }
    }

    // Dispose listeners for removed sessions
    for (const [id, dispose] of this.disposeListeners) {
      if (!activeIds.has(id)) {
        dispose();
        this.disposeListeners.delete(id);
      }
    }

    for (const info of sessions) {
      if (!this.dirtySessionIds.has(info.id)) continue;
      this.dirtySessionIds.delete(info.id);

      const session = this.manager.getSession(info.id);
      if (!session) continue;

      const raw = session.getState();
      const content = stripAnsi(raw);
      const last = this.lastSnapshot.get(info.id);

      if (content === last) continue;

      this.lastSnapshot.set(info.id, content);

      // Ensure timestamps are strictly increasing
      const now = new Date().toISOString();
      const timestamp = now > this.lastTimestamp ? now : new Date(new Date(this.lastTimestamp).getTime() + 1).toISOString();
      this.lastTimestamp = timestamp;

      const bucket = this.entries.get(info.id) ?? [];
      bucket.push({
        timestamp,
        sessionId: info.id,
        content,
      });

      if (bucket.length > this.maxEntries) {
        bucket.splice(0, bucket.length - this.maxEntries);
      }

      this.entries.set(info.id, bucket);
    }

    for (const id of this.lastSnapshot.keys()) {
      if (!activeIds.has(id)) {
        this.lastSnapshot.delete(id);
      }
    }

    for (const id of this.entries.keys()) {
      if (!activeIds.has(id)) {
        const seen = this.lastSeen.get(id) ?? 0;
        if (now - seen >= this.staleMs) {
          this.entries.delete(id);
          this.lastSeen.delete(id);
        }
      }
    }
  }

  getSessionFeed(sessionId: string, since?: string): FeedResponse {
    const bucket = this.entries.get(sessionId) ?? [];
    if (!since) {
      const latest = bucket.length > 0 ? [bucket[bucket.length - 1]] : [];
      return {
        entries: latest,
        nextSince: latest.length > 0 ? latest[0].timestamp : new Date().toISOString(),
      };
    }
    const filtered = bucket.filter(e => e.timestamp > since);
    return {
      entries: filtered,
      nextSince: filtered.length > 0 ? filtered[filtered.length - 1].timestamp : since,
    };
  }

  getAllFeed(since?: string): FeedResponse {
    const all: FeedEntry[] = [];
    for (const bucket of this.entries.values()) {
      all.push(...bucket);
    }
    all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (!since) {
      const latest = all.length > 0 ? [all[all.length - 1]] : [];
      return {
        entries: latest,
        nextSince: latest.length > 0 ? latest[0].timestamp : new Date().toISOString(),
      };
    }
    const filtered = all.filter(e => e.timestamp > since);
    return {
      entries: filtered,
      nextSince: filtered.length > 0 ? filtered[filtered.length - 1].timestamp : since,
    };
  }
}
