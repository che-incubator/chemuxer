import * as k8s from '@kubernetes/client-node';
import net from 'node:net';
import type { WorkspaceInfo } from './workspace-store.js';

export interface EndpointResolver {
  resolve(ws: WorkspaceInfo): Promise<string | null>;
  shutdown(): Promise<void>;
}

export class DirectEndpointResolver implements EndpointResolver {
  async resolve(ws: WorkspaceInfo): Promise<string | null> {
    return ws.endpoint;
  }

  async shutdown(): Promise<void> {}
}

interface Tunnel {
  server: net.Server;
  localPort: number;
}

export class PortForwardEndpointResolver implements EndpointResolver {
  private readonly kc: k8s.KubeConfig;
  private readonly namespace: string;
  private readonly defaultPort: number;
  private readonly tunnels = new Map<string, Tunnel>();
  private readonly portForward: k8s.PortForward;

  constructor(kc: k8s.KubeConfig, namespace: string, defaultPort: number) {
    this.kc = kc;
    this.namespace = namespace;
    this.defaultPort = defaultPort;
    this.portForward = new k8s.PortForward(kc);
  }

  async resolve(ws: WorkspaceInfo): Promise<string | null> {
    if (!ws.ready) return null;

    const existing = this.tunnels.get(ws.pod_name);
    if (existing) {
      return `http://127.0.0.1:${existing.localPort}`;
    }

    const tunnel = await this.createTunnel(ws.pod_name);
    return `http://127.0.0.1:${tunnel.localPort}`;
  }

  private async createTunnel(podName: string): Promise<Tunnel> {
    const server = net.createServer((socket) => {
      this.portForward.portForward(
        this.namespace,
        podName,
        [this.defaultPort],
        socket,
        null,
        socket,
      );
    });

    const localPort = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as net.AddressInfo).port);
      });
    });

    const tunnel: Tunnel = { server, localPort };
    this.tunnels.set(podName, tunnel);
    return tunnel;
  }

  async shutdown(): Promise<void> {
    const closes = Array.from(this.tunnels.values()).map(
      (t) => new Promise<void>((resolve) => t.server.close(() => resolve())),
    );
    await Promise.allSettled(closes);
    this.tunnels.clear();
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
  return new PortForwardEndpointResolver(kc, namespace, defaultPort);
}
