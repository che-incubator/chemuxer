import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FeedCollector } from '../feed-collector.js';
import type { SessionManager } from '../session-manager.js';
import type { Session } from '../session.js';
import type { SessionInfo } from '@chemuxer/shared';

function createMockSession(id: string, state: string): { session: Partial<Session>; setState: (s: string) => void } {
  let currentState = state;
  const dataListeners: Array<(data: string) => void> = [];
  return {
    session: {
      id,
      getState: () => currentState,
      toInfo: () => ({ id, shell: '/bin/sh', title: 'sh', renamed: false, createdAt: Date.now() }),
      onData: (cb: (data: string) => void) => {
        dataListeners.push(cb);
        return () => {
          const idx = dataListeners.indexOf(cb);
          if (idx !== -1) dataListeners.splice(idx, 1);
        };
      },
    },
    setState: (s: string) => {
      currentState = s;
      for (const cb of dataListeners) cb(s);
    },
  };
}

function createMockManager(): {
  manager: SessionManager;
  addSession: (id: string, state: string) => { setState: (s: string) => void };
  removeSession: (id: string) => void;
} {
  const sessions = new Map<string, Partial<Session>>();
  const stateSetters = new Map<string, (s: string) => void>();

  const manager = {
    listSessions: () => Array.from(sessions.values()).map(s => s.toInfo!() as SessionInfo),
    getSession: (id: string) => sessions.get(id) as Session | undefined,
  } as SessionManager;

  return {
    manager,
    addSession: (id: string, state: string) => {
      const mock = createMockSession(id, state);
      sessions.set(id, mock.session);
      stateSetters.set(id, mock.setState);
      return { setState: mock.setState };
    },
    removeSession: (id: string) => {
      sessions.delete(id);
      stateSetters.delete(id);
    },
  };
}

describe('FeedCollector', () => {
  let collector: FeedCollector;

  afterEach(() => {
    collector?.stop();
  });

  it('captures a snapshot when session content changes', () => {
    const { manager, addSession } = createMockManager();
    addSession('s1', '$ hello');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();

    const feed = collector.getSessionFeed('s1');
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].sessionId).toBe('s1');
    expect(feed.entries[0].content).toBe('$ hello');
    expect(feed.entries[0].timestamp).toBeTruthy();
  });

  it('skips snapshot when content is unchanged', () => {
    const { manager, addSession } = createMockManager();
    addSession('s1', '$ hello');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();
    collector.tick();

    const feed = collector.getSessionFeed('s1');
    expect(feed.entries).toHaveLength(1);
  });

  it('captures new snapshot when content changes between ticks', () => {
    const { manager, addSession } = createMockManager();
    const { setState } = addSession('s1', '$ hello');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();
    const firstFeed = collector.getSessionFeed('s1');
    const { nextSince } = firstFeed;

    setState('$ hello\nworld');
    collector.tick();

    const feed = collector.getSessionFeed('s1', nextSince);
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].content).toBe('$ hello\nworld');
  });

  it('evicts oldest entries when ring buffer exceeds maxEntries', () => {
    const { manager, addSession } = createMockManager();
    const { setState } = addSession('s1', 'v0');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 3 });

    for (let i = 1; i <= 5; i++) {
      setState(`v${i}`);
      collector.tick();
    }

    // Get all entries using since from beginning of time
    const feed = collector.getSessionFeed('s1', '1970-01-01T00:00:00.000Z');
    expect(feed.entries).toHaveLength(3);
    expect(feed.entries[0].content).toBe('v3');
    expect(feed.entries[2].content).toBe('v5');
  });

  it('filters entries by since timestamp', async () => {
    const { manager, addSession } = createMockManager();
    const { setState } = addSession('s1', 'v1');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();
    const afterFirst = new Date().toISOString();
    await new Promise(r => setTimeout(r, 10));
    setState('v2');
    collector.tick();

    const feed = collector.getSessionFeed('s1', afterFirst);
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].content).toBe('v2');
  });

  it('returns latest entry when since is omitted', () => {
    const { manager, addSession } = createMockManager();
    const { setState } = addSession('s1', 'v1');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();
    setState('v2');
    collector.tick();

    const feed = collector.getSessionFeed('s1');
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].content).toBe('v2');
  });

  it('returns empty entries when no snapshots exist', () => {
    const { manager } = createMockManager();
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    const feed = collector.getSessionFeed('nonexistent');
    expect(feed.entries).toHaveLength(0);
    expect(feed.nextSince).toBeTruthy();
  });

  it('getAllFeed returns entries across all sessions sorted by timestamp', async () => {
    const { manager, addSession } = createMockManager();
    addSession('s1', 'session 1');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();
    await new Promise(r => setTimeout(r, 10));
    addSession('s2', 'session 2');
    collector.tick();

    // Get all entries using since from beginning of time
    const feed = collector.getAllFeed('1970-01-01T00:00:00.000Z');
    expect(feed.entries.length).toBeGreaterThanOrEqual(2);
    const timestamps = feed.entries.map(e => e.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('retains entries for closed sessions', () => {
    const { manager, addSession, removeSession } = createMockManager();
    addSession('s1', 'before close');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();
    removeSession('s1');
    collector.tick();

    const feed = collector.getSessionFeed('s1');
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].content).toBe('before close');
  });

  it('evicts entries for closed sessions after staleMs expires', () => {
    const { manager, addSession, removeSession } = createMockManager();
    addSession('s1', 'before close');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10, staleMs: 0 });

    collector.tick();
    removeSession('s1');
    collector.tick();

    const feed = collector.getSessionFeed('s1');
    expect(feed.entries).toHaveLength(0);
  });

  it('retains entries for recently closed sessions within staleMs', () => {
    const { manager, addSession, removeSession } = createMockManager();
    addSession('s1', 'before close');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10, staleMs: 60_000 });

    collector.tick();
    removeSession('s1');
    collector.tick();

    const feed = collector.getSessionFeed('s1');
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].content).toBe('before close');
  });

  it('strips ANSI escape sequences from snapshots', () => {
    const { manager, addSession } = createMockManager();
    addSession('s1', '\x1b[32m$ hello\x1b[0m');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();

    const feed = collector.getSessionFeed('s1');
    expect(feed.entries[0].content).toBe('$ hello');
  });

  it('nextSince allows seamless pagination', async () => {
    const { manager, addSession } = createMockManager();
    const { setState } = addSession('s1', 'v1');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    collector.tick();
    const feed1 = collector.getSessionFeed('s1');
    const { nextSince } = feed1;

    await new Promise(r => setTimeout(r, 10));
    setState('v2');
    collector.tick();

    const feed2 = collector.getSessionFeed('s1', nextSince);
    expect(feed2.entries).toHaveLength(1);
    expect(feed2.entries[0].content).toBe('v2');
  });

  it('skips idle sessions that had no new data between ticks', () => {
    const { manager, addSession } = createMockManager();
    addSession('s1', '$ prompt');
    collector = new FeedCollector(manager, { intervalMs: 1000, maxEntries: 10 });

    // First tick: new session is always processed
    collector.tick();
    const feed1 = collector.getSessionFeed('s1', '1970-01-01T00:00:00.000Z');
    expect(feed1.entries).toHaveLength(1);

    // Second tick: no onData fired, session is idle — should not add a new entry
    collector.tick();
    const feed2 = collector.getSessionFeed('s1', '1970-01-01T00:00:00.000Z');
    expect(feed2.entries).toHaveLength(1);
  });
});
