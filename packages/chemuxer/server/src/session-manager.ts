import fs from 'fs';
import { Session, type ISession } from './session.js';
import { K8sExecSession } from './k8s-exec-session.js';
import type { SessionInfo, ServerControlMessage } from '@chemuxer/shared';
import type { SettingsManager } from './settings-manager.js';
import type { ContainerDiscovery } from './container-discovery.js';

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
  private sessions = new Map<string, ISession>();
  private shell: string;
  private scrollbackLines: number;
  private broadcastControl?: (data: ServerControlMessage) => void;
  private discovery: ContainerDiscovery;

  constructor(settingsManager: SettingsManager, discovery: ContainerDiscovery) {
    const settings = settingsManager.getSettings();
    this.shell = resolveShell(settings.shell.path);
    this.scrollbackLines = settings.scrollback.lines;
    this.discovery = discovery;

    settingsManager.onChange((updated) => {
      try {
        this.shell = resolveShell(updated.shell.path);
      } catch (err) {
        console.warn(`[SessionManager] Failed to resolve shell, keeping "${this.shell}":`, err);
      }
      this.scrollbackLines = updated.scrollback.lines;
    });
  }

  setBroadcastControl(fn: (data: ServerControlMessage) => void): void {
    this.broadcastControl = fn;
  }

  createSession(options?: { container?: string }): ISession {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new SessionLimitError();
    }

    const container = options?.container ?? this.discovery.getDefaultContainerName();
    const isLocalSession = container === this.discovery.getDefaultContainerName();

    let session: ISession;
    if (isLocalSession) {
      session = new Session(this.shell, container, { scrollbackLines: this.scrollbackLines });
    } else {
      const k8sSession = new K8sExecSession({
        container,
        shell: this.shell,
        namespace: this.discovery.getNamespace(),
        podName: this.discovery.getPodName(),
        scrollbackLines: this.scrollbackLines,
      });
      // Connect is async, but we don't await here - session starts connecting in background
      k8sSession.connect().catch(err => {
        console.error(`[SessionManager] K8s session ${k8sSession.id} connect failed:`, err);
      });
      session = k8sSession;
    }

    this.sessions.set(session.id, session);

    session.onExit((exitCode) => {
      if (!this.sessions.has(session.id)) return;
      this.closeSession(session.id, true);
      this.broadcastControl?.({ type: 'session-closed', sessionId: session.id, exitCode });
    });

    this.broadcastControl?.({ type: 'session-created', session: session.toInfo() });

    return session;
  }

  getSession(id: string): ISession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.toInfo());
  }

  pinSession(id: string, pinned: boolean): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (pinned) {
      session.pin();
    } else {
      session.unpin();
    }
    return true;
  }

  closeSession(id: string, force?: boolean): 'closed' | 'pinned' | 'not_found' {
    const session = this.sessions.get(id);
    if (!session) return 'not_found';
    if (session.pinned && !force) return 'pinned';
    session.close();
    this.sessions.delete(id);
    return 'closed';
  }

  closeAll(): void {
    for (const [id] of this.sessions) {
      this.closeSession(id, true);
    }
  }
}
