import * as pty from 'node-pty';
import * as crypto from 'crypto';
import * as path from 'path';
import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import type { SessionInfo } from '@chemuxer/shared';

export interface SessionOptions {
  scrollbackLines?: number;
  cols?: number;
  rows?: number;
}

type DataCallback = (data: string) => void;
type ExitCallback = (exitCode: number | null) => void;

export class Session {
  readonly id: string;
  readonly shell: string;
  private readonly defaultTitle: string;
  private customTitle: string | null = null;
  readonly createdAt: number;

  private ptyProcess: pty.IPty;
  private headless: HeadlessTerminal;
  private serializeAddon: SerializeAddon;
  private dataListeners: DataCallback[] = [];
  private exitListeners: ExitCallback[] = [];
  private _isClosed: boolean = false;
  private pendingWrites: number = 0;

  constructor(shell: string, options: SessionOptions = {}) {
    this.id = crypto.randomUUID();
    this.shell = shell;
    this.defaultTitle = path.basename(shell);
    this.createdAt = Date.now();

    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;
    const scrollbackLines = options.scrollbackLines ?? 5000;

    this.headless = new HeadlessTerminal({ cols, rows, scrollback: scrollbackLines });
    this.serializeAddon = new SerializeAddon();
    this.headless.loadAddon(this.serializeAddon);

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || '/',
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      } as Record<string, string>,
    });

    this.ptyProcess.onData((data: string) => {
      this.pendingWrites++;
      this.headless.write(data, () => {
        this.pendingWrites--;
      });
      for (const cb of this.dataListeners) {
        cb(data);
      }
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._isClosed = true;
      for (const cb of this.exitListeners) {
        cb(exitCode);
      }
    });
  }

  get title(): string {
    return this.customTitle ?? this.defaultTitle;
  }

  rename(title: string): void {
    this.customTitle = title.trim() === '' ? null : title;
  }

  get isClosed(): boolean {
    return this._isClosed;
  }

  getState(): string {
    return this.serializeAddon.serialize();
  }

  writeToHeadless(data: string): Promise<void> {
    return new Promise((resolve) => {
      this.headless.write(data, resolve);
    });
  }

  async waitForPendingWrites(): Promise<void> {
    let iterations = 0;
    while (this.pendingWrites > 0 && iterations < 1000) {
      await new Promise(resolve => setImmediate(resolve));
      iterations++;
    }
  }

  write(data: string): void {
    if (!this._isClosed) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this._isClosed) return;
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;

    cols = Math.max(2, Math.min(500, Math.floor(cols)));
    rows = Math.max(1, Math.min(200, Math.floor(rows)));

    this.ptyProcess.resize(cols, rows);
    this.headless.resize(cols, rows);
  }

  onData(cb: DataCallback): () => void {
    this.dataListeners.push(cb);
    return () => {
      const idx = this.dataListeners.indexOf(cb);
      if (idx !== -1) this.dataListeners.splice(idx, 1);
    };
  }

  onExit(cb: ExitCallback): void {
    this.exitListeners.push(cb);
  }

  close(): void {
    if (!this._isClosed) {
      this._isClosed = true;
      this.ptyProcess.kill();
      this.headless.dispose();
    }
  }

  toInfo(): SessionInfo {
    return {
      id: this.id,
      shell: this.shell,
      title: this.title,
      renamed: this.customTitle !== null,
      createdAt: this.createdAt,
    };
  }
}
