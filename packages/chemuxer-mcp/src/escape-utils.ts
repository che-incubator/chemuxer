const NAMED: Record<string, string> = {
  r: '\r',
  n: '\n',
  t: '\t',
  e: '\x1b',
  '\\': '\\',
};

const HEX_RE = /^[0-9a-fA-F]{2}$/;

const CTRL_VALID = /^[@A-Z\[\\\]^_]$/;

export function expandEscapes(input: string): string {
  const out: string[] = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] !== '\\') {
      out.push(input[i]);
      i++;
      continue;
    }

    if (i + 1 >= input.length) {
      throw new Error('Unsupported escape: trailing backslash at end of input');
    }

    const next = input[i + 1];

    if (next in NAMED) {
      out.push(NAMED[next]);
      i += 2;
      continue;
    }

    if (next === 'x') {
      if (i + 3 >= input.length) {
        throw new Error(`Invalid hex escape: \\x requires exactly two hex digits at position ${i}`);
      }
      const hex = input.slice(i + 2, i + 4);
      if (!HEX_RE.test(hex)) {
        throw new Error(`Invalid hex escape: \\x${hex} at position ${i}`);
      }
      const byte = parseInt(hex, 16);
      if (byte > 0x7f) {
        throw new Error(`Invalid hex escape: \\x${hex} at position ${i}. Only 0x00-0x7F supported (bytes above 0x7F are re-encoded as UTF-8 in JSON transport)`);
      }
      out.push(String.fromCharCode(byte));
      i += 4;
      continue;
    }

    if (next === 'c') {
      if (i + 2 >= input.length) {
        throw new Error(`Invalid ctrl escape: \\c requires a character at position ${i}`);
      }
      const ch = input[i + 2];
      if (!CTRL_VALID.test(ch)) {
        throw new Error(`Invalid ctrl escape: \\c${ch} at position ${i}. Valid: @, A-Z, [, \\, ], ^, _`);
      }
      out.push(String.fromCharCode(ch.charCodeAt(0) & 0x1f));
      i += 3;
      continue;
    }

    throw new Error(
      `Unsupported escape: \\${next} at position ${i}. ` +
      'Supported: \\r \\n \\t \\e \\\\ \\xNN \\cX',
    );
  }

  return out.join('');
}
