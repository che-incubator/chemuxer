import { describe, it, expect } from 'vitest';

describe('stdio entry point', () => {
  it('StdioServerTransport is available from MCP SDK', async () => {
    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );
    expect(StdioServerTransport).toBeDefined();
    expect(typeof StdioServerTransport).toBe('function');
  });
});
