import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { DirectEndpointResolver } from '../endpoint-resolver.js';
import { createMcpServer } from '../app.js';
import type { WorkspaceStore } from '../workspace-store.js';
import type { ChemuxerClient } from '../chemuxer-client.js';

describe('stdio entry point', () => {
  it('StdioServerTransport is available from MCP SDK', async () => {
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );
    expect(StdioServerTransport).toBeDefined();
    expect(typeof StdioServerTransport).toBe('function');
  });

  it('createMcpServer registers all 8 tools and connects via transport', async () => {
    const store = {
      list: () => [],
      get: () => undefined,
      synced: true,
    } as unknown as WorkspaceStore;
    const client = {} as unknown as ChemuxerClient;
    const resolver = new DirectEndpointResolver();

    const mcpServer = createMcpServer(store, client, resolver);
    expect(mcpServer).toBeInstanceOf(McpServer);

    const [ct, st] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: 'test', version: '0.0.1' });
    await Promise.all([mcpClient.connect(ct), mcpServer.connect(st)]);

    const { tools } = await mcpClient.listTools();
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([
      'close_terminal',
      'create_terminal',
      'get_activity_feed',
      'get_terminal_output',
      'list_devfile_commands',
      'list_terminals',
      'list_workspaces',
      'send_terminal_input',
    ]);

    await mcpClient.close();
    await mcpServer.close();
  });
});
