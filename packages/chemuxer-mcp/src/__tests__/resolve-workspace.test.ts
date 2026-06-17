import { describe, it, expect } from 'vitest';
import { resolveWorkspace } from '../resolve-workspace.js';
import { ToolError } from '../errors.js';
import type { WorkspaceInfo } from '../workspace-store.js';

function makeStore(entries: Map<string, WorkspaceInfo>) {
  return { get: (name: string) => entries.get(name) } as { get(name: string): WorkspaceInfo | undefined };
}

const readyWorkspace: WorkspaceInfo = {
  workspace_id: 'ws-id-1',
  workspace_name: 'my-workspace',
  pod_name: 'my-workspace-pod',
  phase: 'Running',
  ready: true,
  idled: false,
  endpoint: 'http://10.0.0.1:7681',
};

const idledWorkspace: WorkspaceInfo = {
  workspace_id: 'ws-id-2',
  workspace_name: 'idled-ws',
  pod_name: 'idled-ws-pod',
  phase: 'Running',
  ready: true,
  idled: true,
  endpoint: 'http://10.0.0.2:7681',
};

const notReadyWorkspace: WorkspaceInfo = {
  workspace_id: 'ws-id-3',
  workspace_name: 'starting-ws',
  pod_name: 'starting-ws-pod',
  phase: 'Pending',
  ready: false,
  idled: false,
  endpoint: null,
};

const readyNoEndpoint: WorkspaceInfo = {
  workspace_id: 'ws-id-4',
  workspace_name: 'no-ip-ws',
  pod_name: 'no-ip-ws-pod',
  phase: 'Running',
  ready: true,
  idled: false,
  endpoint: null,
};

describe('resolveWorkspace', () => {
  it('returns WorkspaceInfo for a ready workspace', () => {
    const store = makeStore(new Map([['my-workspace', readyWorkspace]]));
    const result = resolveWorkspace(store, 'my-workspace');
    expect(result).toBe(readyWorkspace);
  });

  it('throws WORKSPACE_NOT_FOUND for missing workspace', () => {
    const store = makeStore(new Map());
    expect(() => resolveWorkspace(store, 'no-such-ws')).toThrow(ToolError);
    try {
      resolveWorkspace(store, 'no-such-ws');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).errorCode).toBe('WORKSPACE_NOT_FOUND');
    }
  });

  it('throws WORKSPACE_IDLED for idled workspace', () => {
    const store = makeStore(new Map([['idled-ws', idledWorkspace]]));
    expect(() => resolveWorkspace(store, 'idled-ws')).toThrow(ToolError);
    try {
      resolveWorkspace(store, 'idled-ws');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).errorCode).toBe('WORKSPACE_IDLED');
    }
  });

  it('throws WORKSPACE_NOT_READY for non-ready workspace', () => {
    const store = makeStore(new Map([['starting-ws', notReadyWorkspace]]));
    expect(() => resolveWorkspace(store, 'starting-ws')).toThrow(ToolError);
    try {
      resolveWorkspace(store, 'starting-ws');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).errorCode).toBe('WORKSPACE_NOT_READY');
      expect((err as ToolError).message).toContain('Pending');
    }
  });

  it('throws WORKSPACE_UNREACHABLE for ready workspace without endpoint', () => {
    const store = makeStore(new Map([['no-ip-ws', readyNoEndpoint]]));
    expect(() => resolveWorkspace(store, 'no-ip-ws')).toThrow(ToolError);
    try {
      resolveWorkspace(store, 'no-ip-ws');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).errorCode).toBe('WORKSPACE_UNREACHABLE');
    }
  });
});
