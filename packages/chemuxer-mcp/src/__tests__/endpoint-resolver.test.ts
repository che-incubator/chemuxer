import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import net from 'node:net';
import {
  DirectEndpointResolver,
  PortForwardEndpointResolver,
  createEndpointResolver,
} from '../endpoint-resolver.js';
import type { WorkspaceInfo } from '../workspace-store.js';

// Mock the PortForward class
vi.mock('@kubernetes/client-node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kubernetes/client-node')>();

  class MockPortForward {
    portForward = vi.fn();
    constructor(_kc: any) {}
  }

  return {
    ...actual,
    PortForward: MockPortForward,
  };
});

const readyWs: WorkspaceInfo = {
  workspace_id: 'ws-1',
  workspace_name: 'my-ws',
  pod_name: 'my-ws-pod',
  phase: 'Running',
  ready: true,
  idled: false,
  endpoint: 'http://10.0.0.5:7681',
};

const notReadyWs: WorkspaceInfo = {
  workspace_id: 'ws-2',
  workspace_name: 'pending-ws',
  pod_name: 'pending-ws-pod',
  phase: 'Pending',
  ready: false,
  idled: false,
  endpoint: null,
};

describe('DirectEndpointResolver', () => {
  it('returns ws.endpoint for a ready workspace', async () => {
    const resolver = new DirectEndpointResolver();
    expect(await resolver.resolve(readyWs)).toBe('http://10.0.0.5:7681');
  });

  it('returns null for a workspace without endpoint', async () => {
    const resolver = new DirectEndpointResolver();
    expect(await resolver.resolve(notReadyWs)).toBeNull();
  });

  it('shutdown is a no-op', async () => {
    const resolver = new DirectEndpointResolver();
    await expect(resolver.shutdown()).resolves.toBeUndefined();
  });
});

describe('PortForwardEndpointResolver', () => {
  function makeKubeConfig(): k8s.KubeConfig {
    const kc = new k8s.KubeConfig();
    kc.loadFromOptions({
      clusters: [{ name: 'test', server: 'https://api.cluster.example.com:6443' }],
      users: [{ name: 'user' }],
      contexts: [{ name: 'ctx', cluster: 'test', user: 'user', namespace: 'test-ns' }],
      currentContext: 'ctx',
    });
    return kc;
  }

  it('returns localhost URL with allocated port for a ready workspace', async () => {
    const kc = makeKubeConfig();
    const resolver = new PortForwardEndpointResolver(kc, 'my-namespace', 7681);

    const url = await resolver.resolve(readyWs);

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const port = parseInt(url!.split(':')[2], 10);
    expect(port).toBeGreaterThan(0);
  });

  it('returns null for a workspace that is not ready', async () => {
    const kc = makeKubeConfig();
    const resolver = new PortForwardEndpointResolver(kc, 'my-namespace', 7681);

    expect(await resolver.resolve(notReadyWs)).toBeNull();
  });

  it('caches tunnel for same pod', async () => {
    const kc = makeKubeConfig();
    const resolver = new PortForwardEndpointResolver(kc, 'my-namespace', 7681);

    const url1 = await resolver.resolve(readyWs);
    const url2 = await resolver.resolve(readyWs);

    expect(url1).toBe(url2);
  });

  it('shutdown closes all tunnels', async () => {
    const kc = makeKubeConfig();
    const resolver = new PortForwardEndpointResolver(kc, 'my-namespace', 7681);

    // Create a tunnel by resolving
    const url = await resolver.resolve(readyWs);
    expect(url).not.toBeNull();

    // Shutdown should close the server
    await resolver.shutdown();

    // After shutdown, the server should be closed
    // We can verify this by trying to connect or by checking internal state
    // For now, we just verify shutdown resolves without error
  });

  it('creates server for each unique pod', async () => {
    const kc = makeKubeConfig();
    const resolver = new PortForwardEndpointResolver(kc, 'my-namespace', 7681);

    const ws2: WorkspaceInfo = {
      ...readyWs,
      workspace_id: 'ws-2',
      workspace_name: 'other-ws',
      pod_name: 'other-ws-pod',
    };

    const url1 = await resolver.resolve(readyWs);
    const url2 = await resolver.resolve(ws2);

    expect(url1).not.toBe(url2);
    const port1 = parseInt(url1!.split(':')[2], 10);
    const port2 = parseInt(url2!.split(':')[2], 10);
    expect(port1).not.toBe(port2);
  });
});

describe('createEndpointResolver', () => {
  it('returns DirectEndpointResolver for sse transport', () => {
    const kc = new k8s.KubeConfig();
    const resolver = createEndpointResolver('sse', kc, 'ns', 7681);
    expect(resolver).toBeInstanceOf(DirectEndpointResolver);
  });

  it('returns PortForwardEndpointResolver for stdio transport', () => {
    const kc = new k8s.KubeConfig();
    kc.loadFromOptions({
      clusters: [{ name: 'c', server: 'https://api.example.com' }],
      users: [{ name: 'u' }],
      contexts: [{ name: 'ctx', cluster: 'c', user: 'u' }],
      currentContext: 'ctx',
    });
    const resolver = createEndpointResolver('stdio', kc, 'ns', 7681);
    expect(resolver).toBeInstanceOf(PortForwardEndpointResolver);
  });
});
