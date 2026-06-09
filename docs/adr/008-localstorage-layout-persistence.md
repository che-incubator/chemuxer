# ADR-008: localStorage Layout Persistence

## Status

Accepted

## Context

The pane layout (binary tree, session-to-pane mapping, focused pane) is client-side state that resets to a single pane on every browser refresh. For users with carefully arranged split layouts, this is a significant UX friction — every refresh requires manually re-splitting.

Server-side persistence was considered but rejected: the layout is a client concern (different browsers could want different layouts), and the server has no concept of panes.

## Decision

A `useEffect` in `useLayout` saves the layout to `localStorage` under key `chemuxer-layout:v1` on every change to tree, panes, or focusedPaneId. Settings tab entries are excluded from the saved data (settings is ephemeral UI).

On mount, the hook reads the saved layout. When the first `sessions` message arrives from the control WebSocket:

1. Extract all sessionIds from the saved layout.
2. Check if every saved sessionId exists in the server's session list.
3. If all match — restore the tree, panes, and focusedPaneId. Reset `nextPaneId` and `nextTabNumber` counters to avoid ID collisions.
4. If any are missing — discard saved layout, fall back to single-pane default.

Sessions present on the server but not in the saved layout are appended to the focused pane by the existing session-sync effect.

## Consequences

- Split layouts survive browser refresh when the server is still running — the common case.
- Server restarts generate new session IDs, so the saved layout is correctly discarded and the user starts fresh.
- The validation step (all saved sessionIds must exist on the server) prevents stale layouts from producing phantom tabs pointing to dead sessions.
- Counter reset (`nextPaneId`, `nextTabNumber`) prevents ID collisions between restored and newly created panes/tabs.
- No debounce is needed — layout changes are infrequent and user-initiated.
- The `v1` suffix in the storage key allows future schema migrations without breaking existing saved layouts.
