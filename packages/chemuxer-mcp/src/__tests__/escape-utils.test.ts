import { describe, it, expect } from 'vitest';
import { expandEscapes } from '../escape-utils.js';

describe('expandEscapes', () => {
  describe('named escapes', () => {
    it('expands \\r to CR (0x0D)', () => {
      expect(expandEscapes('\\r')).toBe('\r');
    });

    it('expands \\n to LF (0x0A)', () => {
      expect(expandEscapes('\\n')).toBe('\n');
    });

    it('expands \\t to TAB (0x09)', () => {
      expect(expandEscapes('\\t')).toBe('\t');
    });

    it('expands \\e to ESC (0x1B)', () => {
      expect(expandEscapes('\\e')).toBe('\x1b');
    });

    it('expands \\\\ to literal backslash (0x5C)', () => {
      expect(expandEscapes('\\\\')).toBe('\\');
    });
  });

  describe('hex escapes (\\xNN)', () => {
    it('expands \\x1b to ESC (0x1B)', () => {
      expect(expandEscapes('\\x1b')).toBe('\x1b');
    });

    it('expands \\x41 to letter A', () => {
      expect(expandEscapes('\\x41')).toBe('A');
    });

    it('expands \\x0d to CR (case-insensitive)', () => {
      expect(expandEscapes('\\x0D')).toBe('\r');
    });
  });

  describe('ctrl escapes (\\cX)', () => {
    it('expands \\cC to Ctrl+C (0x03)', () => {
      expect(expandEscapes('\\cC')).toBe('\x03');
    });

    it('expands \\cD to Ctrl+D (0x04)', () => {
      expect(expandEscapes('\\cD')).toBe('\x04');
    });

    it('expands \\cW to Ctrl+W (0x17)', () => {
      expect(expandEscapes('\\cW')).toBe('\x17');
    });

    it('expands \\c@ to NUL (0x00)', () => {
      expect(expandEscapes('\\c@')).toBe('\x00');
    });

    it('expands \\c[ to ESC (0x1B)', () => {
      expect(expandEscapes('\\c[')).toBe('\x1b');
    });
  });

  describe('compound sequences', () => {
    it('expands \\e[B to down arrow (0x1B 0x5B 0x42)', () => {
      const result = expandEscapes('\\e[B');
      expect(result).toBe('\x1b[B');
      expect(result.length).toBe(3);
    });

    it('expands \\e[A to up arrow', () => {
      expect(expandEscapes('\\e[A')).toBe('\x1b[A');
    });

    it('expands mixed text and escapes: hello\\r', () => {
      expect(expandEscapes('hello\\r')).toBe('hello\r');
    });

    it('expands \\e[B\\r to down arrow + CR', () => {
      const result = expandEscapes('\\e[B\\r');
      expect(result).toBe('\x1b[B\r');
      expect(result.length).toBe(4);
    });
  });

  describe('passthrough', () => {
    it('passes real newline character (0x0A) through unchanged', () => {
      expect(expandEscapes('hello\nworld')).toBe('hello\nworld');
    });

    it('passes plain text through unchanged', () => {
      expect(expandEscapes('ls -la')).toBe('ls -la');
    });

    it('passes empty string through', () => {
      expect(expandEscapes('')).toBe('');
    });

    it('expands \\\\n to literal backslash + n', () => {
      const result = expandEscapes('\\\\n');
      expect(result).toBe('\\n');
      expect(result.length).toBe(2);
    });
  });

  describe('error cases', () => {
    it('throws for unrecognized escape \\q', () => {
      expect(() => expandEscapes('\\q')).toThrow(/unsupported escape/i);
    });

    it('throws for invalid hex \\xZZ', () => {
      expect(() => expandEscapes('\\xZZ')).toThrow(/invalid hex/i);
    });

    it('throws for incomplete hex \\x at end of string', () => {
      expect(() => expandEscapes('\\x')).toThrow(/invalid hex/i);
    });

    it('throws for incomplete hex \\x1 (only one digit)', () => {
      expect(() => expandEscapes('\\x1')).toThrow(/invalid hex/i);
    });

    it('throws for invalid ctrl char \\c1', () => {
      expect(() => expandEscapes('\\c1')).toThrow(/invalid ctrl/i);
    });

    it('throws for incomplete ctrl \\c at end of string', () => {
      expect(() => expandEscapes('\\c')).toThrow(/invalid ctrl/i);
    });

    it('throws for trailing backslash', () => {
      expect(() => expandEscapes('hello\\')).toThrow(/trailing backslash|unsupported escape/i);
    });
  });
});
