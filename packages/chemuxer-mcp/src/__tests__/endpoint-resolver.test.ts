import { describe, it, expect } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import {
  DirectEndpointResolver,
  PodProxyEndpointResolver,
  createEndpointResolver,
} from '../endpoint-resolver.js';
import type { WorkspaceInfo } from '../workspace-store.js';

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
  it('returns ws.endpoint for a ready workspace', () => {
    const resolver = new DirectEndpointResolver();
    expect(resolver.resolve(readyWs)).toBe('http://10.0.0.5:7681');
  });

  it('returns null for a workspace without endpoint', () => {
    const resolver = new DirectEndpointResolver();
    expect(resolver.resolve(notReadyWs)).toBeNull();
  });
});

describe('PodProxyEndpointResolver', () => {
  function makeKubeConfig(server = 'https://api.cluster.example.com:6443'): k8s.KubeConfig {
    const kc = new k8s.KubeConfig();
    kc.loadFromOptions({
      clusters: [{ name: 'test', server }],
      users: [{ name: 'user' }],
      contexts: [{ name: 'ctx', cluster: 'test', user: 'user', namespace: 'test-ns' }],
      currentContext: 'ctx',
    });
    return kc;
  }

  it('builds pod proxy URL for a ready workspace', () => {
    const kc = makeKubeConfig();
    const resolver = new PodProxyEndpointResolver(kc, 'my-namespace', 7681);
    const url = resolver.resolve(readyWs);
    expect(url).toBe(
      'https://api.cluster.example.com:6443/api/v1/namespaces/my-namespace/pods/my-ws-pod:7681/proxy',
    );
  });

  it('returns null for a workspace that is not ready', () => {
    const kc = makeKubeConfig();
    const resolver = new PodProxyEndpointResolver(kc, 'my-namespace', 7681);
    expect(resolver.resolve(notReadyWs)).toBeNull();
  });

  it('strips trailing slash from API server URL', () => {
    const kc = makeKubeConfig('https://api.example.com/');
    const resolver = new PodProxyEndpointResolver(kc, 'ns', 7681);
    const url = resolver.resolve(readyWs);
    expect(url).toMatch(/^https:\/\/api\.example\.com\/api\/v1/);
    expect(url).not.toContain('//api/v1');
  });
});

describe('createEndpointResolver', () => {
  it('returns DirectEndpointResolver for sse transport', () => {
    const kc = new k8s.KubeConfig();
    const resolver = createEndpointResolver('sse', kc, 'ns', 7681);
    expect(resolver).toBeInstanceOf(DirectEndpointResolver);
  });

  it('returns PodProxyEndpointResolver for stdio transport', () => {
    const kc = new k8s.KubeConfig();
    kc.loadFromOptions({
      clusters: [{ name: 'c', server: 'https://api.example.com' }],
      users: [{ name: 'u' }],
      contexts: [{ name: 'ctx', cluster: 'c', user: 'u' }],
      currentContext: 'ctx',
    });
    const resolver = createEndpointResolver('stdio', kc, 'ns', 7681);
    expect(resolver).toBeInstanceOf(PodProxyEndpointResolver);
  });
});
