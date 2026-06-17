import * as k8s from '@kubernetes/client-node';

export const DEFAULT_CHEMUXER_PORT = 7681;

const DW_ID_LABEL = 'controller.devfile.io/devworkspace_id';
const DW_NAME_LABEL = 'controller.devfile.io/devworkspace_name';
const IDLED_ANNOTATION = 'idling.devfile.io/idled';

const RESTART_DELAY_MS = 5_000;

export interface WorkspaceInfo {
  workspace_id: string;
  workspace_name: string;
  pod_name: string;
  phase: string;
  ready: boolean;
  idled: boolean;
  endpoint: string | null;
}

/**
 * Resolve the chemuxer port from a pod spec using a 3-step fallback:
 * 1. Container port named `chemuxer-http`
 * 2. `CHEMUXER_PORT` env var on the first container
 * 3. The provided default port
 */
export function resolveChemuxerPort(pod: k8s.V1Pod, defaultPort: number): number {
  const containers = pod.spec?.containers ?? [];

  // Step 1: named port
  for (const container of containers) {
    for (const port of container.ports ?? []) {
      if (port.name === 'chemuxer-http') {
        return port.containerPort;
      }
    }
  }

  // Step 2: env var on first container
  const firstContainer = containers[0];
  if (firstContainer) {
    for (const env of firstContainer.env ?? []) {
      if (env.name === 'CHEMUXER_PORT' && env.value) {
        const parsed = parseInt(env.value, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  }

  // Step 3: default
  return defaultPort;
}

/**
 * Extract WorkspaceInfo from a pod. Returns null if the pod lacks
 * required DevWorkspace labels.
 */
export function extractWorkspaceInfo(
  pod: k8s.V1Pod,
  defaultPort: number,
): WorkspaceInfo | null {
  const labels = pod.metadata?.labels ?? {};
  const workspaceId = labels[DW_ID_LABEL];
  const workspaceName = labels[DW_NAME_LABEL];

  if (!workspaceId || !workspaceName) {
    return null;
  }

  const annotations = pod.metadata?.annotations ?? {};
  const idled = annotations[IDLED_ANNOTATION] === 'true';

  const phase = pod.status?.phase ?? 'Unknown';
  const conditions = pod.status?.conditions ?? [];
  const ready = conditions.some((c) => c.type === 'Ready' && c.status === 'True');

  const podIP = pod.status?.podIP;
  let endpoint: string | null = null;
  if (ready && podIP) {
    const port = resolveChemuxerPort(pod, defaultPort);
    endpoint = `http://${podIP}:${port}`;
  }

  return {
    workspace_id: workspaceId,
    workspace_name: workspaceName,
    pod_name: pod.metadata?.name ?? '',
    phase,
    ready,
    idled,
    endpoint,
  };
}

export class WorkspaceStore {
  private readonly workspaces = new Map<string, WorkspaceInfo>();
  private informer: (k8s.Informer<k8s.V1Pod> & k8s.ObjectCache<k8s.V1Pod>) | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private _synced = false;
  private readonly defaultPort: number;
  private readonly kc: k8s.KubeConfig;
  private readonly namespace: string;

  constructor(kc: k8s.KubeConfig, namespace: string, defaultPort = DEFAULT_CHEMUXER_PORT) {
    this.kc = kc;
    this.namespace = namespace;
    this.defaultPort = defaultPort;
  }

  get synced(): boolean {
    return this._synced;
  }

  list(): WorkspaceInfo[] {
    return Array.from(this.workspaces.values());
  }

  get(workspaceName: string): WorkspaceInfo | undefined {
    return this.workspaces.get(workspaceName);
  }

  async start(): Promise<void> {
    if (this.informer) {
      await this.stop();
    }
    const labelSelector = DW_ID_LABEL;
    const path = `/api/v1/namespaces/${this.namespace}/pods`;
    const coreApi = this.kc.makeApiClient(k8s.CoreV1Api);

    const listFn = async (): Promise<k8s.KubernetesListObject<k8s.V1Pod>> => {
      const res = await coreApi.listNamespacedPod({ namespace: this.namespace, labelSelector });
      return {
        apiVersion: res.apiVersion,
        kind: res.kind,
        metadata: res.metadata as k8s.V1ListMeta,
        items: res.items,
      };
    };

    this.informer = k8s.makeInformer(this.kc, path, listFn, labelSelector);

    const upsert = (pod: k8s.V1Pod): void => {
      const info = extractWorkspaceInfo(pod, this.defaultPort);
      if (info) {
        this.workspaces.set(info.workspace_name, info);
      }
    };

    const remove = (pod: k8s.V1Pod): void => {
      const name = pod.metadata?.labels?.[DW_NAME_LABEL];
      if (name) {
        this.workspaces.delete(name);
      }
    };

    this.informer.on('add', upsert);
    this.informer.on('update', upsert);
    this.informer.on('delete', remove);

    this.informer.on('connect', () => {
      this._synced = true;
    });

    this.informer.on('error', (err) => {
      this._synced = false;
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
      }
      console.error('[WorkspaceStore] informer error, restarting in 5s:', err);
      this.restartTimer = setTimeout(() => {
        this.workspaces.clear();
        this.informer?.start();
      }, RESTART_DELAY_MS);
    });

    await this.informer.start();
  }

  async stop(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.informer) {
      await this.informer.stop();
      this.informer = null;
    }
    this._synced = false;
  }
}
