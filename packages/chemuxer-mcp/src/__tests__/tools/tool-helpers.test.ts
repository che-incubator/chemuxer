import { describe, it, expect } from 'vitest';
import type { WorkspaceInfo } from '../../workspace-store.js';
import { ToolError } from '../../errors.js';
import { UpstreamError } from '../../chemuxer-client.js';
import { makeWorkspaceStatus, handleToolError } from '../../tools/tool-helpers.js';

const ws: WorkspaceInfo = {
  workspace_id: 'ws-1',
  workspace_name: 'my-ws',
  pod_name: 'my-ws-pod',
  phase: 'Running',
  ready: true,
  idled: false,
  endpoint: 'http://10.0.0.1:7681',
};

describe('makeWorkspaceStatus', () => {
  it('returns workspace_name, ready, phase, and idled', () => {
    const status = makeWorkspaceStatus(ws);
    expect(status).toEqual({
      workspace_name: 'my-ws',
      ready: true,
      phase: 'Running',
      idled: false,
    });
  });
});

describe('handleToolError', () => {
  it('returns error_code and message for ToolError', () => {
    const result = handleToolError(new ToolError('WORKSPACE_NOT_FOUND', 'not found'));
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content as { text: string }[])[0].text);
    expect(body.error_code).toBe('WORKSPACE_NOT_FOUND');
    expect(body.message).toBe('not found');
  });

  it('returns TERMINAL_NOT_FOUND for UpstreamError with status 404', () => {
    const result = handleToolError(new UpstreamError(404, 'no such session'));
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content as { text: string }[])[0].text);
    expect(body.error_code).toBe('TERMINAL_NOT_FOUND');
  });

  it('returns UPSTREAM_ERROR for UpstreamError with status 500', () => {
    const result = handleToolError(new UpstreamError(500, 'internal'));
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content as { text: string }[])[0].text);
    expect(body.error_code).toBe('UPSTREAM_ERROR');
  });

  it('returns UPSTREAM_TIMEOUT for DOMException TimeoutError', () => {
    const err = new DOMException('signal timed out', 'TimeoutError');
    const result = handleToolError(err);
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content as { text: string }[])[0].text);
    expect(body.error_code).toBe('UPSTREAM_TIMEOUT');
    expect(body.message).toBe('Request timed out');
  });

  it('re-throws unknown errors', () => {
    expect(() => handleToolError(new TypeError('boom'))).toThrow(TypeError);
  });
});
