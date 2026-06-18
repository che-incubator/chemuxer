import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import { resolveWorkspace } from '../resolve-workspace.js';
import { makeWorkspaceStatus, handleToolError } from './tool-helpers.js';
import { fanOutFeed } from '../fan-out.js';

export function registerGetActivityFeed(
  server: McpServer,
  store: WorkspaceStore,
  client: ChemuxerClient,
): void {
  server.registerTool(
    'get_activity_feed',
    {
      description:
        'Get recent terminal activity across workspaces. Provide workspace for a single workspace, or omit to aggregate all.',
      inputSchema: z.object({
        workspace: z.string().optional(),
        session_id: z
          .string()
          .regex(/^[A-Za-z0-9._-]+$/)
          .optional(),
        since: z.string().optional(),
        limit: z.number().int().min(1).max(5000).default(500).optional(),
      }),
    },
    async ({ workspace, session_id, since, limit }) => {
      const effectiveLimit = limit ?? 500;

      try {
        if (workspace) {
          // Single-workspace mode
          const ws = resolveWorkspace(store, workspace);
          const resp = await client.getFeed(ws.endpoint!, session_id, since);
          const entries = resp.entries
            .slice(0, effectiveLimit)
            .map((e) => ({ ...e, workspace_name: ws.workspace_name }));
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    entries,
                    nextSince: resp.nextSince,
                    workspace_status: makeWorkspaceStatus(ws),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Cross-workspace mode
        const workspaces = store.list();
        const result = await fanOutFeed(workspaces, client, { since, sessionId: session_id });

        let { entries } = result;
        let { nextSince } = result;

        // Apply limit
        if (entries.length > effectiveLimit) {
          entries = entries.slice(0, effectiveLimit);
          // When truncated, set nextSince to last included entry's timestamp
          if (entries.length > 0) {
            nextSince = entries[entries.length - 1].timestamp;
          }
        }

        // Count ready workspaces (those with endpoints)
        const readyWorkspaces = workspaces.filter((ws) => !!ws.endpoint);
        const failedCount = result.partialFailures?.length ?? 0;
        const succeededCount = readyWorkspaces.length - failedCount;

        // If zero entries AND partialFailures covers all ready workspaces → isError
        if (entries.length === 0 && readyWorkspaces.length > 0 && failedCount >= readyWorkspaces.length) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error_code: 'UPSTREAM_ERROR',
                  message: 'All workspace feeds failed',
                  partial_failures: result.partialFailures,
                }),
              },
            ],
            isError: true,
          };
        }

        const body: Record<string, unknown> = {
          entries,
          nextSince,
          status: {
            total: readyWorkspaces.length,
            succeeded: succeededCount,
            failed: failedCount,
          },
        };
        if (result.partialFailures) {
          body.partial_failures = result.partialFailures;
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
