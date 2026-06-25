import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { EndpointResolver } from '../endpoint-resolver.js';

export function registerListWorkspaces(server: McpServer, store: WorkspaceStore, resolver: EndpointResolver): void {
  server.registerTool(
    'list_workspaces',
    {
      description:
        'List all DevWorkspace pods in the namespace with their status and Chemuxer endpoint.',
      inputSchema: z.object({}),
    },
    async () => {
      const workspaces = store.list().map((ws) => ({
        workspace_id: ws.workspace_id,
        workspace_name: ws.workspace_name,
        pod_name: ws.pod_name,
        phase: ws.phase,
        ready: ws.ready,
        idled: ws.idled,
        endpoint: resolver.resolve(ws),
        ...((!ws.ready || ws.idled) && {
          reason: [
            ws.idled && 'Workspace is idled',
            !ws.ready && `Workspace is not ready (phase: ${ws.phase})`,
          ].filter(Boolean).join('; '),
        }),
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ workspaces }, null, 2),
          },
        ],
      };
    },
  );
}
