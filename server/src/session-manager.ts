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

function isExecutable(shellPath: string): boolean {
  try {
    fs.accessSync(shellPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveShell(requested: string): string {
  const candidates: string[] = [];
  if (requested) candidates.push(requested);
  if (process.env.SHELL) candidates.push(process.env.SHELL);
  candidates.push('/bin/sh');

  const valid = getValidShells();
  for (const shell of candidates) {
    if (valid.has(shell) && isExecutable(shell)) return shell;
  }
  // Fallback: accept $SHELL if executable even without /etc/shells listing (e.g. containers)
  if (process.env.SHELL && isExecutable(process.env.SHELL)) return process.env.SHELL;
  if (isExecutable('/bin/sh')) return '/bin/sh';

  throw new Error(`No usable shell found. Tried: ${candidates.join(', ')}`);
}

const MAX_SESSIONS = 20;

export class SessionLimitError extends Error {
  constructor() {
    super('Maximum session limit reached');
    this.name = 'SessionLimitError';
  }
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
      try {
        this.shell = resolveShell(updated.shell.path);
      } catch (err) {
        console.warn(`[SessionManager] Failed to resolve shell, keeping "${this.shell}":`, err);
      }
      this.scrollbackLines = updated.scrollback.lines;
    });
  }

  createSession(): Session {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new SessionLimitError();
    }
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
