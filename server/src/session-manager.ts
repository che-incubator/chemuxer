import fs from 'fs';
import { Session } from './session.js';
import { SessionInfo } from '../../shared/protocol.js';
import type { SettingsManager } from './settings-manager.js';

function getValidShells(): Set<string> {
  try {
    const content = fs.readFileSync('/etc/shells', 'utf-8');
    return new Set(content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')));
  } catch {
    return new Set(['/bin/sh', '/bin/bash', '/bin/zsh']);
  }
}

function resolveShell(requested: string): string {
  const fallback = process.env.SHELL || '/bin/sh';
  if (!requested) return fallback;
  const valid = getValidShells();
  return valid.has(requested) ? requested : fallback;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private shell: string;
  private scrollbackLines: number;

  constructor(settingsManager: SettingsManager) {
    const settings = settingsManager.getSettings();
    this.shell = resolveShell(settings.shell.path);
    this.scrollbackLines = settings.scrollback.lines;

    settingsManager.onChange((updated) => {
      this.shell = resolveShell(updated.shell.path);
      this.scrollbackLines = updated.scrollback.lines;
    });
  }

  createSession(): Session {
    const session = new Session(this.shell, { scrollbackLines: this.scrollbackLines });
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.toInfo());
  }

  closeSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.close();
      this.sessions.delete(id);
    }
  }

  closeAll(): void {
    for (const [id] of this.sessions) {
      this.closeSession(id);
    }
  }
}
