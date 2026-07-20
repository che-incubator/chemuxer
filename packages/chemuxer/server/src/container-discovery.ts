// packages/chemuxer/server/src/container-discovery.ts
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import type { ContainerInfo, ContainerState } from '@chemuxer/shared';

export class ContainerDiscovery {
  private coreApi: CoreV1Api | null = null;
  private podName: string;
  private namespace: string;
  private defaultContainer: string;

  constructor(defaultContainer: string) {
    this.defaultContainer = defaultContainer;
    this.podName = process.env.HOSTNAME || process.env.POD_NAME || '';
    this.namespace = process.env.POD_NAMESPACE || this.readNamespaceFile();

    try {
      const kc = new KubeConfig();
      kc.loadFromCluster();
      this.coreApi = kc.makeApiClient(CoreV1Api);
    } catch {
      // Not running in a K8s cluster — local dev
    }
  }

  private readNamespaceFile(): string {
    try {
      const fs = require('fs');
      return fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'utf8').trim();
    } catch {
      return 'default';
    }
  }

  async getContainers(): Promise<ContainerInfo[]> {
    if (!this.coreApi || !this.podName) {
      return [this.localFallback()];
    }

    try {
      const pod = await this.coreApi.readNamespacedPod({
        name: this.podName,
        namespace: this.namespace,
      });

      const specContainers = pod.spec?.containers || [];
      const statuses = pod.status?.containerStatuses || [];
      const statusMap = new Map(statuses.map(s => [s.name, s]));

      return specContainers.map(c => {
        const status = statusMap.get(c.name);
        return {
          name: c.name,
          state: this.resolveState(status),
          ready: status?.ready ?? false,
          isDefault: c.name === this.defaultContainer,
        };
      });
    } catch {
      return [this.localFallback()];
    }
  }

  private resolveState(status: any): ContainerState {
    if (!status?.state) return 'waiting';
    if (status.state.running) return 'running';
    if (status.state.terminated) return 'terminated';
    return 'waiting';
  }

  private localFallback(): ContainerInfo {
    return {
      name: this.defaultContainer,
      state: 'running',
      ready: true,
      isDefault: true,
    };
  }

  getDefaultContainerName(): string {
    return this.defaultContainer;
  }

  getPodName(): string {
    return this.podName;
  }

  getNamespace(): string {
    return this.namespace;
  }
}
