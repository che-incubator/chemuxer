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
          'Text to send. Supports escape sequences for control characters. ' +
          'For shell commands, end with \\n. For TUI/interactive prompts, use \\r for Enter. ' +
          'Escapes: \\n (newline/LF), \\r (carriage return/CR), \\t (tab), ' +
          '\\e (ESC), \\\\ (literal backslash), \\xNN (hex byte), \\cX (Ctrl+X). ' +
          'Arrow keys: \\e[A (up), \\e[B (down), \\e[C (right), \\e[D (left). ' +
          'Ctrl combos: \\cC (Ctrl+C/interrupt), \\cD (Ctrl+D/EOF), ' +
          '\\cZ (Ctrl+Z/suspend), \\cL (Ctrl+L/clear), \\cW (Ctrl+W/delete word). ' +
          'Function keys: \\eOP (F1), \\eOQ (F2), \\eOR (F3), \\eOS (F4). ' +
          'Other: \\e[H (Home), \\e[F (End), \\e[5~ (PageUp), \\e[6~ (PageDown). ' +
          'Example TUI flow: \\e[B to move down, \\r to confirm selection.',
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
