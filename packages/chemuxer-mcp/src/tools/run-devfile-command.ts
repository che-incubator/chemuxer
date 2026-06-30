import * as z from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';
import type { EndpointResolver } from '../endpoint-resolver.js';
import { resolveWorkspace } from '../resolve-workspace.js';
import { handleToolError } from './tool-helpers.js';
import { ToolError } from '../errors.js';

export function registerRunDevfileCommand(
  server: McpServer,
  store: WorkspaceStore,
  client: ChemuxerClient,
  resolver: EndpointResolver,
): void {
  server.registerTool(
    'run_devfile_command',
    {
      description: 'Run a devfile exec command in a new terminal session.',
      inputSchema: z.object({
        workspace: z.string().describe('DevWorkspace name'),
        command_id: z.string().describe('Devfile command ID to run'),
      }),
    },
    async ({ workspace, command_id }) => {
      try {
        const ws = await resolveWorkspace(store, resolver, workspace);
        const endpoint = ws.resolvedEndpoint;

        const commands = await client.listDevfileCommands(endpoint);
        const cmd = commands.find((c) => c.id === command_id);
        if (!cmd) {
          throw new ToolError('COMMAND_NOT_FOUND', `Command '${command_id}' not found in devfile`);
        }

        const session = await client.createSession(endpoint, { pinned: false });

        const commandText = cmd.workingDir
          ? `cd '${cmd.workingDir.replace(/'/g, `'\\''`)}' && ${cmd.commandLine}\n`
          : `${cmd.commandLine}\n`;
        await client.sendInput(endpoint, session.id, commandText);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              session_id: session.id,
              command_id: cmd.id,
              component: cmd.component,
            }, null, 2),
          }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
