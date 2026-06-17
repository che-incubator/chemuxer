import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { WorkspaceInfo } from '../workspace-store.js';
import type { WorkspaceStatus } from '../errors.js';
import { ToolError } from '../errors.js';
import { UpstreamError } from '../chemuxer-client.js';

export type ToolErrorResult = CallToolResult & { isError: true };

export function makeWorkspaceStatus(ws: WorkspaceInfo): WorkspaceStatus {
  return {
    workspace_name: ws.workspace_name,
    ready: ws.ready,
    phase: ws.phase,
    idled: ws.idled,
  };
}

export function handleToolError(err: unknown): ToolErrorResult {
  if (err instanceof ToolError) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error_code: err.errorCode, message: err.message }) }],
      isError: true,
    };
  }
  if (err instanceof UpstreamError) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error_code: 'UPSTREAM_ERROR', message: err.message }) }],
      isError: true,
    };
  }
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error_code: 'UPSTREAM_TIMEOUT', message: 'Request timed out' }) }],
      isError: true,
    };
  }
  throw err;
}
