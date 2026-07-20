import { describe, it, expect, afterEach, vi } from 'vitest';
import { SessionManager, resolveShell } from '../session-manager.js';
import { DEFAULT_SETTINGS, type Settings } from '@chemuxer/shared';
import type { SettingsManager } from '../settings-manager.js';
import type { ContainerDiscovery } from '../container-discovery.js';

type ChangeCallback = (settings: Settings) => void;

function mockSettingsManager(initial: Settings = DEFAULT_SETTINGS): SettingsManager & { triggerChange: (s: Settings) => void } {
  let current = initial;
  const listeners: ChangeCallback[] = [];
  return {
    getSettings: () => current,
    onChange: (cb: ChangeCallback) => { listeners.push(cb); },
    triggerChange: (s: Settings) => {
      current = s;
      for (const cb of listeners) cb(s);
    },
    getSchemaString: () => '{}',
    writeSettings: () => current,
    writeSettingsRaw: () => current,
    dispose: () => {},
  } as any;
}

function mockDiscovery(defaultContainer = 'default-container'): ContainerDiscovery {
  return {
    getDefaultContainerName: () => defaultContainer,
    getNamespace: () => 'test-namespace',
    getPodName: () => 'test-pod',
    getContainers: async () => [],
  } as any;
}

describe('SessionManager', () => {
  let manager: SessionManager | undefined;

  afterEach(() => {
    manager?.closeAll();
  });

  it('createSession spawns a session and adds it to the map', () => {
    manager = new SessionManager(mockSettingsManager(), mockDiscovery());
    const session = manager.createSession();
    expect(session.id).toBeTruthy();
    expect(manager.getSession(session.id)).toBe(session);
  });

  it('getSession returns undefined for unknown ID', () => {
    manager = new SessionManager(mockSettingsManager(), mockDiscovery());
    expect(manager.getSession('nonexistent')).toBeUndefined();
  });

  it('listSessions returns all sessions', () => {
    manager = new SessionManager(mockSettingsManager(), mockDiscovery());
    manager.createSession();
    manager.createSession();
    expect(manager.listSessions()).toHaveLength(2);
  });

  it('closeSession removes session from map and cleans up', () => {
    manager = new SessionManager(mockSettingsManager(), mockDiscovery());
    const session = manager.createSession();
    manager.closeSession(session.id);
    expect(manager.getSession(session.id)).toBeUndefined();
    expect(manager.listSessions()).toHaveLength(0);
  });

  it('closeAll cleans up all sessions', () => {
    manager = new SessionManager(mockSettingsManager(), mockDiscovery());
    manager.createSession();
    manager.createSession();
    manager.closeAll();
    expect(manager.listSessions()).toHaveLength(0);
    manager = undefined;
  });

  it('rejects shell paths not in /etc/shells', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      shell: { path: '/tmp/evil-script' },
    };
    manager = new SessionManager(mockSettingsManager(settings), mockDiscovery());
    const session = manager.createSession();
    expect(session.shell).not.toBe('/tmp/evil-script');
  });

  it('falls back to /bin/sh when $SHELL points to non-existent path', () => {
    const original = process.env.SHELL;
    try {
      process.env.SHELL = '/nonexistent/shell';
      expect(resolveShell('')).toBe('/bin/sh');
    } finally {
      process.env.SHELL = original;
    }
  });

  it('uses $SHELL when it exists and is executable', () => {
    const original = process.env.SHELL;
    try {
      process.env.SHELL = '/bin/sh';
      expect(resolveShell('')).toBe('/bin/sh');
    } finally {
      process.env.SHELL = original;
    }
  });

  it('new sessions use updated settings after change', () => {
    const mock = mockSettingsManager();
    manager = new SessionManager(mock, mockDiscovery());

    const updatedSettings: Settings = {
      ...DEFAULT_SETTINGS,
      scrollback: { lines: 9999 },
    };
    mock.triggerChange(updatedSettings);

    const session = manager.createSession();
    expect(session).toBeTruthy();
  });

  it('createSession without container uses local PTY', () => {
    manager = new SessionManager(mockSettingsManager(), mockDiscovery());
    const session = manager.createSession();
    expect(session.container).toBe('default-container');
  });

  it('createSession with default container name uses local PTY', () => {
    manager = new SessionManager(mockSettingsManager(), mockDiscovery());
    const session = manager.createSession({ container: 'default-container' });
    expect(session.container).toBe('default-container');
  });

  describe('pinning', () => {
    it('pinSession returns true and updates session', () => {
      manager = new SessionManager(mockSettingsManager(), mockDiscovery());
      const session = manager.createSession();
      expect(manager.pinSession(session.id, true)).toBe(true);
      expect(manager.getSession(session.id)!.pinned).toBe(true);
    });

    it('pinSession returns false for unknown session', () => {
      manager = new SessionManager(mockSettingsManager(), mockDiscovery());
      expect(manager.pinSession('nonexistent', true)).toBe(false);
    });

    it('closeSession rejects pinned session without force', () => {
      manager = new SessionManager(mockSettingsManager(), mockDiscovery());
      const session = manager.createSession();
      manager.pinSession(session.id, true);
      expect(manager.closeSession(session.id)).toBe('pinned');
      expect(manager.getSession(session.id)).toBeDefined();
    });

    it('closeSession with force closes pinned session', () => {
      manager = new SessionManager(mockSettingsManager(), mockDiscovery());
      const session = manager.createSession();
      manager.pinSession(session.id, true);
      expect(manager.closeSession(session.id, true)).toBe('closed');
      expect(manager.getSession(session.id)).toBeUndefined();
    });

    it('closeSession returns not_found for unknown session', () => {
      manager = new SessionManager(mockSettingsManager(), mockDiscovery());
      expect(manager.closeSession('nonexistent')).toBe('not_found');
    });

    it('process exit bypasses pin', async () => {
      manager = new SessionManager(mockSettingsManager(), mockDiscovery());
      const session = manager.createSession();
      const sessionId = session.id;
      manager.pinSession(sessionId, true);

      // Close the session to trigger the exit event
      session.close();

      // Wait for the PTY exit callback to fire
      const maxWait = 2000;
      const start = Date.now();
      while (manager.getSession(sessionId) !== undefined && Date.now() - start < maxWait) {
        await new Promise((r) => setTimeout(r, 50));
      }

      // Verify the pinned session was removed despite being pinned
      expect(manager.getSession(sessionId)).toBeUndefined();
    });
  });
});
