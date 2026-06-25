import type { WorkspaceStore, WorkspaceInfo } from './workspace-store.js';
import type { EndpointResolver } from './endpoint-resolver.js';
import { ToolError } from './errors.js';

export interface ResolvedWorkspace extends WorkspaceInfo {
  resolvedEndpoint: string;
}

export function resolveWorkspace(
  store: WorkspaceStore,
  resolver: EndpointResolver,
  workspaceName: string,
): ResolvedWorkspace {
  const ws = store.get(workspaceName);
  if (!ws) {
    throw new ToolError('WORKSPACE_NOT_FOUND', `Workspace "${workspaceName}" not found`);
  }
  if (ws.idled) {
    throw new ToolError('WORKSPACE_IDLED', `Workspace "${workspaceName}" is idled`);
  }
  if (!ws.ready) {
    throw new ToolError(
      'WORKSPACE_NOT_READY',
      `Workspace "${workspaceName}" is not ready (phase: ${ws.phase})`,
    );
  }
  const resolvedEndpoint = resolver.resolve(ws);
  if (!resolvedEndpoint) {
    throw new ToolError(
      'WORKSPACE_UNREACHABLE',
      `Workspace "${workspaceName}" is ready but has no reachable endpoint`,
    );
  }
  return { ...ws, resolvedEndpoint };
}
