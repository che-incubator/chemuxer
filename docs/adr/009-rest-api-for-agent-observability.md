# ADR-009: REST API for Agent Observability

## Status

Accepted

## Context

Chemuxer runs inside Eclipse Che workspace pods as the terminal multiplexer. Orchestrator agents (Claude Code, Gemini CLI, etc.) execute tasks in terminal sessions, but there is no programmatic way for an external agent to read terminal output or manage sessions. The UI is a React SPA accessible only through a browser.

In the agentic workspaces ecosystem, a personal agent on a remote machine needs to check in on workspace activity — read what the orchestrator agents are doing, inspect scrollback content, and optionally send input. Today, che-mcp-server reads terminal output via `kubectl exec` + `tmux capture-pane`. Chemuxer replaces tmux, so it needs its own access surface.

Three approaches were considered: REST-first with MCP wrapper, WebSocket-native with REST reads, and a separate agent service on a dedicated port.

## Decision

We expose terminal session data via a REST API on the existing Express server (port 7681), a polling-based activity feed, and a `/agents.md` discovery endpoint. No MCP server in Chemuxer.

**REST API** (`/api/sessions/*`) provides session CRUD, terminal buffer read (`getState()` with ANSI stripping), and input send. Mutations broadcast to connected WebSocket control clients so the human UI stays in sync.

**Activity feed** (`/api/feed?since=<timestamp>`) provides periodic rendered text snapshots of terminal output. A `FeedCollector` runs a timer (default 60s, configurable via `FEED_INTERVAL_MS`), calls `session.getState()` on each active session, diffs against the previous snapshot, and stores changed entries in a per-session ring buffer (default 60 entries, configurable via `FEED_MAX_ENTRIES`).

**`/agents.md`** serves a plain-text markdown document teaching agents how to interact with Chemuxer. This is the discovery entry point — an agent with no prior configuration fetches it, reads the API surface, and starts making HTTP calls. No MCP pre-configuration required.

**No MCP server** because agents inside the Che ecosystem already have che-mcp-server, which covers workspace management, terminal I/O, and agent orchestration. Adding a second MCP server in Chemuxer would be redundant. When che-mcp-server needs terminal data, it calls Chemuxer's REST API over the pod network — replacing `kubectl exec` + `tmux capture-pane`.

**No layout exposure** — layout (pane tree, tab assignments) is a client-only UI concern. The API exposes sessions, not pane topology.

## Consequences

- External agents can read terminal output and manage sessions via plain HTTP — no browser, WebSocket, or MCP pre-configuration needed.
- The `agents.md` pattern provides self-documenting API discovery without requiring agents to be pre-configured with MCP server details.
- The polling-based feed is simple and stateless — no persistent connection required. An agent checks in every few minutes and catches up via `nextSince` pagination.
- Feed snapshots are full terminal renders (not deltas), so every fetch is self-contained — agents need no prior state. The trade-off is larger payloads, but terminal text is kilobytes, not megabytes.
- ANSI stripping means agents get clean readable text, but formatting information (colors, bold) is lost.
- The feed interval (default 60s) means up to 60 seconds of latency before output appears in the feed. Real-time streaming via SSE can be added later if needed.
- No authentication — Chemuxer relies on Che's routing layer for access control, same trust model as the existing human UI.
- The `entries` map in FeedCollector grows unbounded for long-lived servers that create and destroy many sessions — a minor memory concern for a personal tool, addressable later.
