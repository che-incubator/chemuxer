import { describe, it, expect } from 'vitest';
import { stripAnsi } from '../strip-ansi.js';

describe('stripAnsi', () => {
  it('passes through plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('strips CSI color sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips CSI sequences with multiple params', () => {
    expect(stripAnsi('\x1b[1;32mbold green\x1b[0m')).toBe('bold green');
  });

  it('strips OSC sequences (title sets)', () => {
    expect(stripAnsi('\x1b]0;window title\x07text')).toBe('text');
  });

  it('strips OSC sequences with ST terminator', () => {
    expect(stripAnsi('\x1b]0;title\x1b\\text')).toBe('text');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('handles text with only escape sequences', () => {
    expect(stripAnsi('\x1b[31m\x1b[0m')).toBe('');
  });

  it('preserves newlines and whitespace', () => {
    expect(stripAnsi('line1\n\x1b[32mline2\x1b[0m\nline3')).toBe('line1\nline2\nline3');
  });

  it('strips DEC private mode sequences', () => {
    expect(stripAnsi('\x1b[?25hvisible\x1b[?25l')).toBe('visible');
  });

  it('strips cursor positioning sequences', () => {
    expect(stripAnsi('\x1b[10;20Htext')).toBe('text');
  });

  it('strips alternate screen buffer sequences', () => {
    expect(stripAnsi('\x1b[?1049hcontent\x1b[?1049l')).toBe('content');
  });
});
