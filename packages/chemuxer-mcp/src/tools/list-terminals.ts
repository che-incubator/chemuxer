import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import type { EndpointResolver } from '../endpoint-resolver.js';
import { resolveWorkspace } from '../resolve-workspace.js';
import { makeWorkspaceStatus, handleToolError } from './tool-helpers.js';

export function registerListTerminals(
  server: McpServer,
  store: WorkspaceStore,
  client: ChemuxerClient,
  resolver: EndpointResolver,
): void {
  server.registerTool(
    'list_terminals',
    {
      description: 'List all terminal sessions in a workspace.',
      inputSchema: z.object({
        workspace: z.string().describe('DevWorkspace name'),
      }),
    },
    async ({ workspace }) => {
      try {
        const ws = await resolveWorkspace(store, resolver, workspace);
        const sessions = await client.listSessions(ws.resolvedEndpoint);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ sessions, workspace_status: makeWorkspaceStatus(ws) }, null, 2),
          }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
