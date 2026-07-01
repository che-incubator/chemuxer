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
  sockets: Set<net.Socket>;
}

export class PortForwardEndpointResolver implements EndpointResolver {
  private readonly kc: k8s.KubeConfig;
  private readonly namespace: string;
  private readonly defaultPort: number;
  private readonly tunnels = new Map<string, Tunnel>();
  private readonly pendingTunnels = new Map<string, Promise<Tunnel>>();
  private readonly portForward: k8s.PortForward;
  private shuttingDown = false;

  constructor(kc: k8s.KubeConfig, namespace: string, defaultPort: number) {
    this.kc = kc;
    this.namespace = namespace;
    this.defaultPort = defaultPort;
    this.portForward = new k8s.PortForward(kc);
  }

  async resolve(ws: WorkspaceInfo): Promise<string | null> {
    if (this.shuttingDown || !ws.ready) return null;

    const existing = this.tunnels.get(ws.pod_name);
    if (existing) {
      return `http://127.0.0.1:${existing.localPort}`;
    }

    // Deduplicate concurrent resolve calls for the same pod
    const pending = this.pendingTunnels.get(ws.pod_name);
    if (pending) {
      const tunnel = await pending;
      return `http://127.0.0.1:${tunnel.localPort}`;
    }

    const tunnelPromise = this.createTunnel(ws.pod_name);
    this.pendingTunnels.set(ws.pod_name, tunnelPromise);

    try {
      const tunnel = await tunnelPromise;
      return `http://127.0.0.1:${tunnel.localPort}`;
    } finally {
      this.pendingTunnels.delete(ws.pod_name);
    }
  }

  private async createTunnel(podName: string): Promise<Tunnel> {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      this.portForward
        .portForward(this.namespace, podName, [this.defaultPort], socket, null, socket)
        .catch((err) => {
          console.error(`Port forward error for pod ${podName}:`, err);
          socket.destroy();
        });
    });

    const localPort = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('Failed to get server address'));
          return;
        }
        resolve(addr.port);
      });
    });

    server.on('error', (err) => {
      console.error(`Server error for pod ${podName} on port ${localPort}:`, err);
    });

    const tunnel: Tunnel = { server, localPort, sockets };
    this.tunnels.set(podName, tunnel);
    return tunnel;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.allSettled(Array.from(this.pendingTunnels.values()));
    const closes = Array.from(this.tunnels.values()).map(
      (t) =>
        new Promise<void>((resolve) => {
          for (const socket of t.sockets) socket.destroy();
          t.server.close(() => resolve());
        }),
    );
    await Promise.allSettled(closes);
    this.pendingTunnels.clear();
    this.tunnels.clear();
  }
}

export function createEndpointResolver(
  transport: 'stdio' | 'http',
  kc: k8s.KubeConfig,
  namespace: string,
  defaultPort: number,
): EndpointResolver {
  if (transport === 'http') {
    return new DirectEndpointResolver();
  }
  return new PortForwardEndpointResolver(kc, namespace, defaultPort);
}
