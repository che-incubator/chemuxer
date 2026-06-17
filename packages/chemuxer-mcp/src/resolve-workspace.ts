import type { WorkspaceStore, WorkspaceInfo } from './workspace-store.js';
import { ToolError } from './errors.js';

export function resolveWorkspace(
  store: WorkspaceStore,
  workspaceName: string,
): WorkspaceInfo {
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
  if (!ws.endpoint) {
    throw new ToolError(
      'WORKSPACE_UNREACHABLE',
      `Workspace "${workspaceName}" is ready but has no reachable endpoint`,
    );
  }
  return ws;
}
