import { describe, it, expect } from 'vitest';
import { resolveWorkspace } from '../resolve-workspace.js';
import { DirectEndpointResolver } from '../endpoint-resolver.js';
import { ToolError } from '../errors.js';
import type { WorkspaceInfo } from '../workspace-store.js';

const resolver = new DirectEndpointResolver();

function makeStore(entries: Map<string, WorkspaceInfo>) {
  return { get: (name: string) => entries.get(name) } as unknown as import('../workspace-store.js').WorkspaceStore;
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
  it('returns ResolvedWorkspace for a ready workspace', async () => {
    const store = makeStore(new Map([['my-workspace', readyWorkspace]]));
    const result = await resolveWorkspace(store, resolver, 'my-workspace');
    expect(result.resolvedEndpoint).toBe('http://10.0.0.1:7681');
  });

  it('throws WORKSPACE_NOT_FOUND for missing workspace', async () => {
    const store = makeStore(new Map());
    await expect(() => resolveWorkspace(store, resolver, 'no-such-ws')).rejects.toThrow(ToolError);
    try {
      await resolveWorkspace(store, resolver, 'no-such-ws');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).errorCode).toBe('WORKSPACE_NOT_FOUND');
    }
  });

  it('throws WORKSPACE_IDLED for idled workspace', async () => {
    const store = makeStore(new Map([['idled-ws', idledWorkspace]]));
    await expect(() => resolveWorkspace(store, resolver, 'idled-ws')).rejects.toThrow(ToolError);
    try {
      await resolveWorkspace(store, resolver, 'idled-ws');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).errorCode).toBe('WORKSPACE_IDLED');
    }
  });

  it('throws WORKSPACE_NOT_READY for non-ready workspace', async () => {
    const store = makeStore(new Map([['starting-ws', notReadyWorkspace]]));
    await expect(() => resolveWorkspace(store, resolver, 'starting-ws')).rejects.toThrow(ToolError);
    try {
      await resolveWorkspace(store, resolver, 'starting-ws');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).errorCode).toBe('WORKSPACE_NOT_READY');
      expect((err as ToolError).message).toContain('Pending');
    }
  });

  it('throws WORKSPACE_UNREACHABLE for ready workspace without endpoint', async () => {
    const store = makeStore(new Map([['no-ip-ws', readyNoEndpoint]]));
    await expect(() => resolveWorkspace(store, resolver, 'no-ip-ws')).rejects.toThrow(ToolError);
    try {
      await resolveWorkspace(store, resolver, 'no-ip-ws');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolError);
      expect((err as ToolError).errorCode).toBe('WORKSPACE_UNREACHABLE');
    }
  });
});
