import { describe, it, expect, vi, beforeEach } from 'vitest';
import { K8sExecSession } from '../k8s-exec-session.js';
import { EventEmitter, PassThrough } from 'stream';

vi.mock('@kubernetes/client-node', () => {
  const mockExec = { exec: vi.fn() };
  return {
    KubeConfig: function () {
      return { loadFromCluster: vi.fn(), makeApiClient: () => mockExec };
    },
    Exec: vi.fn(),
    __mockExec: mockExec,
  };
});

describe('K8sExecSession', () => {
  it('has correct container and shell properties', () => {
    const session = new K8sExecSession({
      container: 'sidecar-tools',
      shell: '/bin/bash',
      namespace: 'ns',
      podName: 'pod-1',
    });

    expect(session.container).toBe('sidecar-tools');
    expect(session.shell).toBe('/bin/bash');
    expect(session.id).toBeTruthy();
  });

  it('starts as not closed', () => {
    const session = new K8sExecSession({
      container: 'sidecar-tools',
      shell: '/bin/bash',
      namespace: 'ns',
      podName: 'pod-1',
    });

    expect(session.isClosed).toBe(false);
  });

  it('close() marks session as closed', () => {
    const session = new K8sExecSession({
      container: 'sidecar-tools',
      shell: '/bin/bash',
      namespace: 'ns',
      podName: 'pod-1',
    });

    session.close();
    expect(session.isClosed).toBe(true);
  });

  it('toInfo() includes container field', () => {
    const session = new K8sExecSession({
      container: 'sidecar-tools',
      shell: '/bin/bash',
      namespace: 'ns',
      podName: 'pod-1',
    });

    const info = session.toInfo();
    expect(info.container).toBe('sidecar-tools');
    expect(info.shell).toBe('/bin/bash');
  });
});
