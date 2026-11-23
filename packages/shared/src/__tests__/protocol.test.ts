import { describe, it, expect } from 'vitest';
import { isClientControlMessage } from '../protocol.js';

describe('isClientControlMessage', () => {
  it('accepts create with container field', () => {
    expect(isClientControlMessage({ type: 'create', container: 'tools' })).toBe(true);
  });

  it('accepts create without container field (backward compat)', () => {
    expect(isClientControlMessage({ type: 'create' })).toBe(true);
  });

  it('rejects create with non-string container', () => {
    expect(isClientControlMessage({ type: 'create', container: 123 })).toBe(false);
  });

  it('accepts pin message with sessionId and pinned boolean', () => {
    expect(isClientControlMessage({ type: 'pin', sessionId: 'abc', pinned: true })).toBe(true);
    expect(isClientControlMessage({ type: 'pin', sessionId: 'abc', pinned: false })).toBe(true);
  });

  it('rejects pin message without sessionId', () => {
    expect(isClientControlMessage({ type: 'pin', pinned: true })).toBe(false);
  });

  it('rejects pin message without pinned boolean', () => {
    expect(isClientControlMessage({ type: 'pin', sessionId: 'abc' })).toBe(false);
  });

  it('rejects pin message with non-boolean pinned', () => {
    expect(isClientControlMessage({ type: 'pin', sessionId: 'abc', pinned: 'yes' })).toBe(false);
  });
});
