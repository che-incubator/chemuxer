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
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('returns defaults when no env vars are set', () => {
    const config = loadConfig();
    expect(config).toEqual({
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
});
