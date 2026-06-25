import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import type { EndpointResolver } from '../endpoint-resolver.js';
import { resolveWorkspace } from '../resolve-workspace.js';
import { makeWorkspaceStatus, handleToolError } from './tool-helpers.js';
import { fanOutFeed } from '../fan-out.js';

export function registerGetActivityFeed(
  server: McpServer,
  store: WorkspaceStore,
  client: ChemuxerClient,
  resolver: EndpointResolver,
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
        limit: z.number().int().min(1).max(5000).default(500),
      }),
    },
    async ({ workspace, session_id, since, limit }) => {
      const effectiveLimit = limit;

      try {
        if (workspace) {
          // Single-workspace mode
          const ws = await resolveWorkspace(store, resolver, workspace);
          const resp = await client.getFeed(ws.resolvedEndpoint, session_id, since);
          const entries = resp.entries
            .slice(0, effectiveLimit)
            .map((e) => ({ ...e, workspace_name: ws.workspace_name }));
          let { nextSince } = resp;
          if (resp.entries.length > effectiveLimit && entries.length > 0) {
            nextSince = entries[entries.length - 1].timestamp;
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    entries,
                    nextSince,
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
        const result = await fanOutFeed(workspaces, client, resolver, { since, sessionId: session_id });

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

        const resolvedCount = result.resolvedCount;
        const failedCount = result.partialFailures?.length ?? 0;
        const succeededCount = resolvedCount - failedCount;

        if (entries.length === 0 && resolvedCount > 0 && failedCount >= resolvedCount) {
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
            total: resolvedCount,
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
