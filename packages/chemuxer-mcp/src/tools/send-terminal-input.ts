import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import { resolveWorkspace } from '../resolve-workspace.js';
import { makeWorkspaceStatus, handleToolError } from './tool-helpers.js';

export function registerSendTerminalInput(
  server: McpServer,
  store: WorkspaceStore,
  client: ChemuxerClient,
): void {
  server.registerTool(
    'send_terminal_input',
    {
      description: 'Send text input to a terminal session. Include \\n for Enter.',
      inputSchema: z.object({
        workspace: z.string().describe('DevWorkspace name'),
        session_id: z.string().describe('Terminal session ID'),
        input: z.string().describe('Text to send (include \\n for Enter)'),
      }),
    },
    async ({ workspace, session_id, input }) => {
      try {
        const ws = resolveWorkspace(store, workspace);
        await client.sendInput(ws.endpoint!, session_id, input);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ accepted: true, workspace_status: makeWorkspaceStatus(ws) }, null, 2),
          }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
