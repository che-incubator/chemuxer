# ADR-001: Single-Process TypeScript Architecture

## Status

Accepted

## Context

Chemuxer replaces ttyd + tmux in the Eclipse Che / Dev Sandboxes agentic workspaces ecosystem. ttyd uses a stale xterm.js fork and relies on tmux for session persistence, requiring users to learn tmux keybindings. The system serves a single user per container — no horizontal scaling or multi-tenancy needed.

We needed a modern terminal multiplexer with native browser UX (tabs, splits, drag-and-drop) and shell persistence across browser disconnects, deployable as a single container process.

## Decision

We built a single Node.js process using TypeScript end-to-end:

- **Backend:** Express serves the static React frontend and a WebSocket server. `node-pty` manages PTY sessions. Two WebSocket channels: a control channel (`/ws/control`) for session lifecycle (create, close, rename, settings) and per-session I/O channels (`/ws/:sessionId`) for binary terminal data.
- **Frontend:** React + xterm.js 6.x with component-based UI (tabs, split panes, command palette).
- **Shared types:** `shared/protocol.ts` defines the WebSocket message protocol, ensuring type safety across the boundary.
- **Build:** Vite for frontend dev/build, `tsc` for backend compilation, Vitest for both environments.

Key design choices:
- Separate control and I/O WebSocket channels keep binary terminal data paths clean — no framing or multiplexing overhead.
- Multiple clients can connect to the same session (browser tab reloads, multiple browsers).
- Server creates a default session on startup so the user never sees an empty state.

## Consequences

- Single language (TypeScript) across the entire stack reduces context switching and enables shared type definitions.
- Single process simplifies deployment (one container, one port 7681) but limits to single-user scenarios.
- `node-pty` is battle-tested (VS Code uses it) but requires native compilation in the container image.
- No authentication layer — handled by the Che/K8s gateway at the infrastructure level.
- The separate I/O channel design means each terminal tab opens its own WebSocket, which scales linearly with open sessions but avoids multiplexing complexity.
