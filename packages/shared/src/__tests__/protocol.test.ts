import { describe, it, expect } from 'vitest';
import { isClientControlMessage } from '../protocol.js';

describe('isClientControlMessage', () => {
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
