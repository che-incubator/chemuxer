import { describe, it, expect } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import {
  extractWorkspaceInfo,
  resolveChemuxerPort,
  DEFAULT_CHEMUXER_PORT,
} from '../workspace-store.js';

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
