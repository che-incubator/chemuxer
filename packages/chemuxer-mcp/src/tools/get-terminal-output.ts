import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import { resolveWorkspace } from '../resolve-workspace.js';
import { makeWorkspaceStatus, handleToolError } from './tool-helpers.js';

export function registerGetTerminalOutput(
  server: McpServer,
  store: WorkspaceStore,
  client: ChemuxerClient,
): void {
  server.registerTool(
    'get_terminal_output',
    {
      description: 'Get the current terminal buffer content as plain text (ANSI-stripped).',
      inputSchema: z.object({
        workspace: z.string().describe('DevWorkspace name'),
        session_id: z.string().regex(/^[A-Za-z0-9._-]+$/, 'session_id contains invalid characters').describe('Terminal session ID'),
        max_bytes: z.number().int().min(1).max(65536).default(16384)
          .describe('Maximum bytes to return (default 16384, max 65536)'),
      }),
    },
    async ({ workspace, session_id, max_bytes }) => {
      try {
        const ws = resolveWorkspace(store, workspace);
        const content = await client.getBuffer(ws.endpoint!, session_id);

        const encoder = new TextEncoder();
        const bytes = encoder.encode(content);
        const truncated = bytes.length > max_bytes;

        let finalContent = content;
        if (truncated) {
          let end = max_bytes;
          while (end > 0) {
            try {
              finalContent = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(0, end));
              break;
            } catch {
              end -= 1;
            }
          }
          if (end === 0) finalContent = '';
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              content: finalContent,
              truncated,
              workspace_status: makeWorkspaceStatus(ws),
            }, null, 2),
          }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
