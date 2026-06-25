import type * as k8s from '@kubernetes/client-node';
import type { WorkspaceInfo } from './workspace-store.js';

export interface EndpointResolver {
  resolve(ws: WorkspaceInfo): string | null;
}

export class DirectEndpointResolver implements EndpointResolver {
  resolve(ws: WorkspaceInfo): string | null {
    return ws.endpoint;
  }
}

export class PodProxyEndpointResolver implements EndpointResolver {
  private readonly apiServerBase: string;
  private readonly namespace: string;
  private readonly defaultPort: number;

  constructor(kc: k8s.KubeConfig, namespace: string, defaultPort: number) {
    const cluster = kc.getCurrentCluster();
    if (!cluster) {
      throw new Error('No current cluster in kubeconfig');
    }
    this.apiServerBase = cluster.server.replace(/\/+$/, '');
    this.namespace = namespace;
    this.defaultPort = defaultPort;
  }

  resolve(ws: WorkspaceInfo): string | null {
    if (!ws.ready) return null;
    return `${this.apiServerBase}/api/v1/namespaces/${this.namespace}/pods/${ws.pod_name}:${this.defaultPort}/proxy`;
  }
}

export function createEndpointResolver(
  transport: 'stdio' | 'sse',
  kc: k8s.KubeConfig,
  namespace: string,
  defaultPort: number,
): EndpointResolver {
  if (transport === 'sse') {
    return new DirectEndpointResolver();
  }
  return new PodProxyEndpointResolver(kc, namespace, defaultPort);
}
