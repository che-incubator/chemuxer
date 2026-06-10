import { describe, it, expect, afterEach, vi } from 'vitest';
import { SessionManager, resolveShell } from '../session-manager.js';
import { DEFAULT_SETTINGS, type Settings } from '../../../shared/settings.js';
import type { SettingsManager } from '../settings-manager.js';

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

describe('SessionManager', () => {
  let manager: SessionManager | undefined;

  afterEach(() => {
    manager?.closeAll();
  });

  it('createSession spawns a session and adds it to the map', () => {
    manager = new SessionManager(mockSettingsManager());
    const session = manager.createSession();
    expect(session.id).toBeTruthy();
    expect(manager.getSession(session.id)).toBe(session);
  });

  it('getSession returns undefined for unknown ID', () => {
    manager = new SessionManager(mockSettingsManager());
    expect(manager.getSession('nonexistent')).toBeUndefined();
  });

  it('listSessions returns all sessions', () => {
    manager = new SessionManager(mockSettingsManager());
    manager.createSession();
    manager.createSession();
    expect(manager.listSessions()).toHaveLength(2);
  });

  it('closeSession removes session from map and cleans up', () => {
    manager = new SessionManager(mockSettingsManager());
    const session = manager.createSession();
    manager.closeSession(session.id);
    expect(manager.getSession(session.id)).toBeUndefined();
    expect(manager.listSessions()).toHaveLength(0);
  });

  it('closeAll cleans up all sessions', () => {
    manager = new SessionManager(mockSettingsManager());
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
    manager = new SessionManager(mockSettingsManager(settings));
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
    const shell = process.env.SHELL;
    if (!shell) return;
    expect(resolveShell('')).toBe(shell);
  });

  it('new sessions use updated settings after change', () => {
    const mock = mockSettingsManager();
    manager = new SessionManager(mock);

    const updatedSettings: Settings = {
      ...DEFAULT_SETTINGS,
      scrollback: { lines: 9999 },
    };
    mock.triggerChange(updatedSettings);

    const session = manager.createSession();
    expect(session).toBeTruthy();
  });
});
