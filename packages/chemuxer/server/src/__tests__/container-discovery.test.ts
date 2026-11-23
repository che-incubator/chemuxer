import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerDiscovery } from '../container-discovery.js';

// Mock @kubernetes/client-node
const mockCoreApi = {
  readNamespacedPod: vi.fn(),
};

vi.mock('@kubernetes/client-node', () => {
  return {
    KubeConfig: function () {
      return {
        loadFromCluster: vi.fn(),
        makeApiClient: () => mockCoreApi,
      };
    },
    CoreV1Api: vi.fn(),
  };
});

describe('ContainerDiscovery', () => {
  beforeEach(() => {
    vi.stubEnv('HOSTNAME', 'workspace-abc-123');
    vi.stubEnv('POD_NAMESPACE', 'user-namespace');
  });

  it('returns container list from pod spec', async () => {
    mockCoreApi.readNamespacedPod.mockResolvedValue({
      metadata: { annotations: {} },
      spec: {
        containers: [
          { name: 'dev-container' },
          { name: 'sidecar-db' },
        ],
      },
      status: {
        containerStatuses: [
          { name: 'dev-container', ready: true, state: { running: {} } },
          { name: 'sidecar-db', ready: true, state: { running: {} } },
        ],
      },
    });

    const discovery = new ContainerDiscovery('dev-container');
    const containers = await discovery.getContainers();

    expect(containers).toHaveLength(2);
    expect(containers[0]).toEqual({
      name: 'dev-container',
      state: 'running',
      ready: true,
      isDefault: true,
    });
    expect(containers[1]).toEqual({
      name: 'sidecar-db',
      state: 'running',
      ready: true,
      isDefault: false,
    });
  });

  it('returns single local container when K8s API is unavailable', async () => {
    mockCoreApi.readNamespacedPod.mockRejectedValue(new Error('not in cluster'));

    const discovery = new ContainerDiscovery('dev-container');
    const containers = await discovery.getContainers();

    expect(containers).toHaveLength(1);
    expect(containers[0]).toEqual({
      name: 'dev-container',
      state: 'running',
      ready: true,
      isDefault: true,
    });
  });

  it('identifies waiting and terminated containers', async () => {
    mockCoreApi.readNamespacedPod.mockResolvedValue({
      metadata: { annotations: {} },
      spec: {
        containers: [
          { name: 'main' },
          { name: 'init-svc' },
        ],
      },
      status: {
        containerStatuses: [
          { name: 'main', ready: true, state: { running: {} } },
          { name: 'init-svc', ready: false, state: { waiting: { reason: 'CrashLoopBackOff' } } },
        ],
      },
    });

    const discovery = new ContainerDiscovery('main');
    const containers = await discovery.getContainers();

    expect(containers[1]).toMatchObject({
      name: 'init-svc',
      state: 'waiting',
      ready: false,
    });
  });
});
