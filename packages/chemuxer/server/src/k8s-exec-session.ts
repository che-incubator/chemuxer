import * as crypto from 'crypto';
import * as path from 'path';
import { KubeConfig, Exec } from '@kubernetes/client-node';
import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import type { SessionInfo } from '@chemuxer/shared';
import type { ISession, SessionOptions } from './session.js';
import { Writable, Readable, PassThrough } from 'stream';
import WebSocket from 'ws';

export interface K8sExecSessionOptions extends SessionOptions {
  container: string;
  shell: string;
  namespace: string;
  podName: string;
}

type DataCallback = (data: string) => void;
type ExitCallback = (exitCode: number | null) => void;

export class K8sExecSession implements ISession {
  readonly id: string;
  readonly shell: string;
  readonly container: string;
  readonly createdAt: number;

  private defaultTitle: string;
  private customTitle: string | null = null;
  private headless: HeadlessTerminal;
  private serializeAddon: SerializeAddon;
  private dataListeners: DataCallback[] = [];
  private exitListeners: ExitCallback[] = [];
  private _isClosed = false;
  private _pinned = false;
  private wsConnection: WebSocket | null = null;
  private pendingWrites = 0;
  private stdin: PassThrough | null = null;

  private namespace: string;
  private podName: string;

  constructor(options: K8sExecSessionOptions) {
    this.id = crypto.randomUUID();
    this.shell = options.shell;
    this.container = options.container;
    this.defaultTitle = path.basename(options.shell);
    this.createdAt = Date.now();
    this.namespace = options.namespace;
    this.podName = options.podName;

    const cols = options.cols ?? 80;
    const rows = options.rows ?? 24;
    const scrollbackLines = options.scrollbackLines ?? 5000;

    this.headless = new HeadlessTerminal({ cols, rows, scrollback: scrollbackLines });
    this.serializeAddon = new SerializeAddon();
    this.headless.loadAddon(this.serializeAddon);
  }

  async connect(): Promise<void> {
    const kc = new KubeConfig();
    kc.loadFromCluster();
    const exec = new Exec(kc);

    const stdout = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        const data = chunk.toString();
        this.pendingWrites++;
        this.headless.write(data, () => { this.pendingWrites--; });
        for (const cb of this.dataListeners) cb(data);
        callback();
      },
    });

    const stderr = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        const data = chunk.toString();
        this.pendingWrites++;
        this.headless.write(data, () => { this.pendingWrites--; });
        for (const cb of this.dataListeners) cb(data);
        callback();
      },
    });

    const stdin = new PassThrough();
    this.stdin = stdin;

    this.wsConnection = await exec.exec(
      this.namespace,
      this.podName,
      this.container,
      [this.shell],
      stdout,
      stderr,
      stdin,
      true,
      (status) => {
        this._isClosed = true;
        const code = status?.status === 'Success' ? 0 : 1;
        for (const cb of this.exitListeners) cb(code);
      },
    );
  }

  get title(): string {
    return this.customTitle ?? this.defaultTitle;
  }

  rename(title: string): void {
    this.customTitle = title.trim() === '' ? null : title;
  }

  get pinned(): boolean { return this._pinned; }
  pin(): void { this._pinned = true; }
  unpin(): void { this._pinned = false; }
  get isClosed(): boolean { return this._isClosed; }

  getState(): string {
    return this.serializeAddon.serialize();
  }

  write(data: string): void {
    if (!this._isClosed && this.stdin) {
      this.stdin.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this._isClosed) return;
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
    cols = Math.max(2, Math.min(500, Math.floor(cols)));
    rows = Math.max(1, Math.min(200, Math.floor(rows)));
    this.headless.resize(cols, rows);
    // K8s resize via the resize channel
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      const resizeMsg = JSON.stringify({ Width: cols, Height: rows });
      const buf = Buffer.alloc(1 + resizeMsg.length);
      buf.writeUInt8(4, 0); // channel 4 = resize
      buf.write(resizeMsg, 1);
      this.wsConnection.send(buf);
    }
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
      this.wsConnection?.close();
      this.headless.dispose();
    }
  }

  toInfo(): SessionInfo {
    return {
      id: this.id,
      shell: this.shell,
      title: this.title,
      renamed: this.customTitle !== null,
      pinned: this._pinned,
      createdAt: this.createdAt,
      container: this.container,
    };
  }
}
