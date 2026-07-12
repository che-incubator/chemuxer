import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import type { EndpointResolver } from '../endpoint-resolver.js';
import { resolveWorkspace } from '../resolve-workspace.js';
import { sessionIdSchema, makeWorkspaceStatus, handleToolError } from './tool-helpers.js';
import { expandEscapes } from '../escape-utils.js';

export function registerSendTerminalInput(
  server: McpServer,
  store: WorkspaceStore,
  client: ChemuxerClient,
  resolver: EndpointResolver,
): void {
  server.registerTool(
    'send_terminal_input',
    {
      description: 'Send text input to a terminal session. Include \\n for Enter.',
      inputSchema: z.object({
        workspace: z.string().describe('DevWorkspace name'),
        session_id: sessionIdSchema,
        input: z.string().describe(
          'Text to send (include \\n for Enter). Supports escape sequences: ' +
          '\\n (newline), \\r (carriage return/Enter for TUI), \\t (tab), ' +
          '\\e (ESC for ANSI sequences), \\\\ (literal backslash), ' +
          '\\xNN (hex byte), \\cX (Ctrl+X). ' +
          'Examples: \\e[B for down arrow, \\e[A for up arrow, \\r to confirm, ' +
          '\\cC for Ctrl+C, \\cD for Ctrl+D.',
        ),
      }),
    },
    async ({ workspace, session_id, input }) => {
      try {
        const ws = await resolveWorkspace(store, resolver, workspace);
        let expanded: string;
        try {
          expanded = expandEscapes(input);
        } catch (e) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error_code: 'INVALID_INPUT', message: (e as Error).message }),
            }],
            isError: true,
          };
        }
        await client.sendInput(ws.resolvedEndpoint, session_id, expanded);
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
