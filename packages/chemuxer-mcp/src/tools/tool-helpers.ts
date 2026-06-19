import { z } from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { WorkspaceInfo } from '../workspace-store.js';
import type { WorkspaceStatus, ErrorCode } from '../errors.js';
import { ToolError } from '../errors.js';
import { UpstreamError } from '../chemuxer-client.js';

export const sessionIdSchema = z.string().regex(/^[A-Za-z0-9._-]+$/, 'session_id contains invalid characters').describe('Terminal session ID');

export interface ClassifiedError {
  errorCode: ErrorCode;
  message: string;
}

export function classifyError(err: unknown): ClassifiedError | null {
  if (err instanceof ToolError) {
    return { errorCode: err.errorCode, message: err.message };
  }
  if (err instanceof UpstreamError) {
    return { errorCode: 'UPSTREAM_ERROR', message: err.message };
  }
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return { errorCode: 'UPSTREAM_TIMEOUT', message: 'Request timed out' };
  }
  return null;
}

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
  const classified = classifyError(err);
  if (classified) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error_code: classified.errorCode, message: classified.message }) }],
      isError: true,
    };
  }
  throw err;
}
