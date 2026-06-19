import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import {
  extractWorkspaceInfo,
  resolveChemuxerPort,
  DEFAULT_CHEMUXER_PORT,
} from '../workspace-store.js';

/**
 * Minimal informer stub that lets tests fire events manually.
 */
function createFakeInformer() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(cb);
    },
    async start() {
      /* no-op */
    },
    async stop() {
      /* no-op */
    },
    /** Fire an event manually from the test. */
    emit(event: string, ...args: unknown[]) {
      for (const fn of handlers.get(event) ?? []) fn(...args);
    },
  };
}

let fakeInformer = createFakeInformer();

vi.mock('@kubernetes/client-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kubernetes/client-node')>();
  return {
    ...actual,
    makeInformer: vi.fn(() => fakeInformer),
  };
});

// Re-import WorkspaceStore AFTER the mock is set up.
const { WorkspaceStore } = await import('../workspace-store.js');

function makePod(overrides: {
  name?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  phase?: string;
  podIP?: string;
  containers?: Array<{
    name: string;
    ports?: Array<{ name?: string; containerPort: number }>;
    env?: Array<{ name: string; value: string }>;
  }>;
} = {}): k8s.V1Pod {
  const pod = new k8s.V1Pod();
  pod.metadata = {
    name: overrides.name ?? 'ws-pod-abc',
    labels: overrides.labels ?? {
      'controller.devfile.io/devworkspace_id': 'ws-id-123',
      'controller.devfile.io/devworkspace_name': 'my-workspace',
    },
    annotations: overrides.annotations,
  } as k8s.V1ObjectMeta;
  pod.status = {
    phase: overrides.phase ?? 'Running',
    podIP: overrides.podIP,
    conditions: overrides.podIP
      ? [{ type: 'Ready', status: 'True' } as k8s.V1PodCondition]
      : [],
  } as k8s.V1PodStatus;
  pod.spec = {
    containers: (overrides.containers ?? [{ name: 'main' }]).map((c) => ({
      name: c.name,
      ports: c.ports?.map((p) => ({
        name: p.name,
        containerPort: p.containerPort,
      })),
      env: c.env?.map((e) => ({ name: e.name, value: e.value })),
    })),
  } as k8s.V1PodSpec;
  return pod;
}

describe('DEFAULT_CHEMUXER_PORT', () => {
  it('is 7681', () => {
    expect(DEFAULT_CHEMUXER_PORT).toBe(7681);
  });
});

describe('resolveChemuxerPort', () => {
  it('uses named port chemuxer-http when present', () => {
    const pod = makePod({
      containers: [
        {
          name: 'main',
          ports: [
            { name: 'other', containerPort: 8080 },
            { name: 'chemuxer-http', containerPort: 9999 },
          ],
        },
      ],
    });
    expect(resolveChemuxerPort(pod, DEFAULT_CHEMUXER_PORT)).toBe(9999);
  });

  it('uses CHEMUXER_PORT env var when no named port', () => {
    const pod = makePod({
      containers: [
        {
          name: 'main',
          env: [{ name: 'CHEMUXER_PORT', value: '5555' }],
        },
      ],
    });
    expect(resolveChemuxerPort(pod, DEFAULT_CHEMUXER_PORT)).toBe(5555);
  });

  it('falls back to default port when no hints', () => {
    const pod = makePod({
      containers: [{ name: 'main' }],
    });
    expect(resolveChemuxerPort(pod, DEFAULT_CHEMUXER_PORT)).toBe(7681);
  });

  it('finds CHEMUXER_PORT on a non-first container', () => {
    const pod = makePod({
      containers: [
        { name: 'gateway' },
        { name: 'chemuxer', env: [{ name: 'CHEMUXER_PORT', value: '8888' }] },
      ],
    });
    expect(resolveChemuxerPort(pod, DEFAULT_CHEMUXER_PORT)).toBe(8888);
  });

  it('rejects port numbers above 65535', () => {
    const pod = makePod({
      containers: [
        { name: 'main', env: [{ name: 'CHEMUXER_PORT', value: '99999' }] },
      ],
    });
    expect(resolveChemuxerPort(pod, DEFAULT_CHEMUXER_PORT)).toBe(7681);
  });
});

describe('extractWorkspaceInfo', () => {
  it('returns WorkspaceInfo for a ready pod with podIP', () => {
    const pod = makePod({ podIP: '10.0.0.5' });
    const info = extractWorkspaceInfo(pod, DEFAULT_CHEMUXER_PORT);

    expect(info).not.toBeNull();
    expect(info!.workspace_id).toBe('ws-id-123');
    expect(info!.workspace_name).toBe('my-workspace');
    expect(info!.pod_name).toBe('ws-pod-abc');
    expect(info!.phase).toBe('Running');
    expect(info!.ready).toBe(true);
    expect(info!.idled).toBe(false);
    expect(info!.endpoint).toBe('http://10.0.0.5:7681');
  });

  it('returns null endpoint for a non-ready pod', () => {
    const pod = makePod({ phase: 'Pending' });
    const info = extractWorkspaceInfo(pod, DEFAULT_CHEMUXER_PORT);

    expect(info).not.toBeNull();
    expect(info!.ready).toBe(false);
    expect(info!.endpoint).toBeNull();
  });

  it('sets idled true when idling annotation is present', () => {
    const pod = makePod({
      podIP: '10.0.0.5',
      annotations: { 'idling.devfile.io/idled': 'true' },
    });
    const info = extractWorkspaceInfo(pod, DEFAULT_CHEMUXER_PORT);

    expect(info).not.toBeNull();
    expect(info!.idled).toBe(true);
  });

  it('returns null when required labels are missing', () => {
    const pod = makePod({ labels: {} });
    const info = extractWorkspaceInfo(pod, DEFAULT_CHEMUXER_PORT);

    expect(info).toBeNull();
  });
});

/* ---------- WorkspaceStore (informer lifecycle) ---------- */

describe('WorkspaceStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Each test gets a fresh informer so handlers don't leak.
    fakeInformer = createFakeInformer();
    vi.mocked(k8s.makeInformer).mockReturnValue(
      fakeInformer as unknown as k8s.Informer<k8s.V1Pod> & k8s.ObjectCache<k8s.V1Pod>,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createStore(): InstanceType<typeof WorkspaceStore> {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    // Mock makeApiClient to avoid real HTTP calls.
    vi.spyOn(kc, 'makeApiClient').mockReturnValue({
      listNamespacedPod: vi.fn(),
    } as unknown as k8s.CoreV1Api);
    return new WorkspaceStore(kc, 'test-ns');
  }

  function addWorkspace(store: InstanceType<typeof WorkspaceStore>): void {
    const pod = makePod({ podIP: '10.0.0.1' });
    fakeInformer.emit('connect');
    fakeInformer.emit('add', pod);
    // Sanity: workspace must be visible after add event.
    expect(store.list()).toHaveLength(1);
    expect(store.synced).toBe(true);
  }

  it('preserves workspace data on informer error', async () => {
    const store = createStore();
    await store.start();

    addWorkspace(store);

    // Simulate a transient K8s API error.
    fakeInformer.emit('error', new Error('transient network hiccup'));

    // Workspaces must still be accessible.
    expect(store.list()).toHaveLength(1);
    expect(store.get('my-workspace')).toBeDefined();
    expect(store.get('my-workspace')!.workspace_id).toBe('ws-id-123');
  });

  it('keeps synced true on informer error', async () => {
    const store = createStore();
    await store.start();

    addWorkspace(store);

    fakeInformer.emit('error', new Error('transient error'));

    // synced must remain true — stale data is better than no data.
    expect(store.synced).toBe(true);
  });

  it('schedules informer restart after error', async () => {
    const store = createStore();
    await store.start();

    const startSpy = vi.spyOn(fakeInformer, 'start');

    fakeInformer.emit('error', new Error('watch timeout'));

    // Restart should not happen immediately.
    expect(startSpy).not.toHaveBeenCalled();

    // Advance past the 5-second restart delay.
    await vi.advanceTimersByTimeAsync(5_000);

    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('rolling update: old pod delete does not remove new pod', async () => {
    const store = createStore();
    await store.start();
    fakeInformer.emit('connect');

    // New pod arrives (add event for pod-v2).
    const podV2 = makePod({ name: 'ws-pod-v2', podIP: '10.0.0.2' });
    fakeInformer.emit('add', podV2);
    expect(store.get('my-workspace')).toBeDefined();
    expect(store.get('my-workspace')!.pod_name).toBe('ws-pod-v2');

    // Old pod terminates (delete event for pod-v1, same workspace_name label).
    const podV1 = makePod({ name: 'ws-pod-v1' });
    fakeInformer.emit('delete', podV1);

    // The new pod must still be visible — the delete must not have removed it.
    const info = store.get('my-workspace');
    expect(info).toBeDefined();
    expect(info!.pod_name).toBe('ws-pod-v2');
    expect(info!.endpoint).toBe('http://10.0.0.2:7681');
    expect(store.list()).toHaveLength(1);
  });

  it('clears workspaces on explicit stop()', async () => {
    const store = createStore();
    await store.start();

    addWorkspace(store);

    await store.stop();

    expect(store.list()).toHaveLength(0);
    expect(store.synced).toBe(false);
  });
});
