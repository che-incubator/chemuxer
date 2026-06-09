# ADR-004: Headless xterm.js for Terminal State Restore

## Status

Accepted

## Context

The original scrollback mechanism was a raw ring buffer capturing PTY output bytes verbatim. On browser reconnect, the buffer was replayed into the client's xterm.js. This worked for simple command output but failed for full-screen TUI apps (vim, htop, Claude Code) because:

- Escape sequences for cursor positioning are position-dependent.
- Alternate screen buffer state is lost.
- The ring buffer has no concept of terminal state — just raw bytes.

Reconnecting to a TUI session rendered as garbage.

## Decision

Replace the ring buffer with `@xterm/headless` + `@xterm/addon-serialize` running server-side.

During normal operation, all PTY output is written to both the headless terminal and connected WebSocket clients. The headless terminal maintains full virtual terminal state: screen buffer, cursor position, scrollback history, alternate screen, colors, and attributes.

On reconnect, `serializeAddon.serialize()` produces an escape sequence string that reconstructs the complete terminal state. The client's xterm.js processes this as normal terminal output — no client-side changes needed.

The scrollback setting changed from bytes to lines (`scrollback.size` → `scrollback.lines`, default 5000 lines) to align with xterm.js's line-based scrollback model.

## Consequences

- Full-screen TUI apps restore correctly on reconnect — cursor position, colors, alternate screen buffer, and scrollback are all preserved.
- The server now runs a headless xterm.js instance per session, adding memory overhead proportional to scrollback depth and terminal dimensions.
- `@xterm/headless` and `@xterm/addon-serialize` must be version-matched with the client-side `@xterm/xterm` to avoid serialization compatibility issues.
- The scrollback setting change from bytes to lines is a breaking change for existing config files, handled gracefully via deep-merge with new defaults.
- No client-side code changes were needed — the reconnect protocol is the same, just the data quality improved.
