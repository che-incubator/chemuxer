import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all config env vars before each test
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.NAMESPACE;
    delete process.env.CHEMUXER_DEFAULT_PORT;
    delete process.env.REQUEST_TIMEOUT_MS;
    delete process.env.CHEMUXER_MCP_TRANSPORT;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  it('returns defaults when no env vars are set', () => {
    const config = loadConfig();
    expect(config).toEqual({
      transport: 'stdio',
      port: 3001,
      host: '0.0.0.0',
      namespace: undefined,
      chemuxerDefaultPort: 7681,
      requestTimeoutMs: 2000,
    });
  });

  it('parses numeric env vars correctly', () => {
    process.env.PORT = '8080';
    process.env.CHEMUXER_DEFAULT_PORT = '9999';
    process.env.REQUEST_TIMEOUT_MS = '5000';
    process.env.HOST = '127.0.0.1';
    process.env.NAMESPACE = 'test-ns';

    const config = loadConfig();
    expect(config).toEqual({
      transport: 'stdio',
      port: 8080,
      host: '127.0.0.1',
      namespace: 'test-ns',
      chemuxerDefaultPort: 9999,
      requestTimeoutMs: 5000,
    });
  });

  it('throws on invalid numeric value', () => {
    process.env.PORT = 'abc';
    expect(() => loadConfig()).toThrow();
  });

  it('returns a frozen object', () => {
    const config = loadConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });

  describe('transport config', () => {
    it('defaults transport to stdio when no env or args', () => {
      const config = loadConfig();
      expect(config.transport).toBe('stdio');
    });

    it('reads transport from CHEMUXER_MCP_TRANSPORT env var', () => {
      process.env.CHEMUXER_MCP_TRANSPORT = 'http';
      const config = loadConfig();
      expect(config.transport).toBe('http');
    });

    it('throws on invalid transport value', () => {
      process.env.CHEMUXER_MCP_TRANSPORT = 'websocket';
      expect(() => loadConfig()).toThrow();
    });
  });

  describe('CLI arg parsing', () => {
    it('--transport overrides env var', () => {
      process.env.CHEMUXER_MCP_TRANSPORT = 'stdio';
      const config = loadConfig(['--transport', 'http']);
      expect(config.transport).toBe('http');
    });

    it('--port overrides PORT env var', () => {
      process.env.PORT = '3001';
      const config = loadConfig(['--port', '9999']);
      expect(config.port).toBe(9999);
    });

    it('--namespace overrides NAMESPACE env var', () => {
      process.env.NAMESPACE = 'env-ns';
      const config = loadConfig(['--namespace', 'cli-ns']);
      expect(config.namespace).toBe('cli-ns');
    });

    it('ignores unknown flags', () => {
      const config = loadConfig(['--unknown', 'val']);
      expect(config.transport).toBe('stdio');
    });
  });
});
