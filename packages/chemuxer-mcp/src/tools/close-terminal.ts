import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import type { EndpointResolver } from '../endpoint-resolver.js';
import { resolveWorkspace } from '../resolve-workspace.js';
import { sessionIdSchema, makeWorkspaceStatus, handleToolError } from './tool-helpers.js';

export function registerCloseTerminal(
  server: McpServer,
  store: WorkspaceStore,
  client: ChemuxerClient,
  resolver: EndpointResolver,
): void {
  server.registerTool(
    'close_terminal',
    {
      description: 'Close a terminal session in a workspace.',
      inputSchema: z.object({
        workspace: z.string().describe('DevWorkspace name'),
        session_id: sessionIdSchema,
      }),
    },
    async ({ workspace, session_id }) => {
      try {
        const ws = resolveWorkspace(store, resolver, workspace);
        await client.closeSession(ws.resolvedEndpoint, session_id);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ closed: true, workspace_status: makeWorkspaceStatus(ws) }, null, 2),
          }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
