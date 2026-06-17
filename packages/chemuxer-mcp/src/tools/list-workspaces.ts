import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';

export function registerListWorkspaces(server: McpServer, store: WorkspaceStore): void {
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
        endpoint: ws.endpoint,
        ...((!ws.ready || ws.idled) && {
          reason: ws.idled
            ? 'Workspace is idled'
            : `Workspace is not ready (phase: ${ws.phase})`,
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
