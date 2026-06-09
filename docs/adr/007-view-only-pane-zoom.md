# ADR-007: View-Only Pane Zoom

## Status

Accepted

## Context

Users with multiple split panes need a way to temporarily focus on a single pane without destroying the layout. Two approaches were considered:

1. **Tree mutation:** collapse the tree to a single leaf, storing the original tree for restore. This changes actual layout state and requires careful handling of session lifecycle events during zoom.
2. **View-only flag:** store a `zoomedPaneId` and render only that pane. The tree is untouched — zoom is purely a rendering concern.

## Decision

We use a view-only zoom: `useLayout` stores `zoomedPaneId: string | null`. `LayoutRenderer` checks this flag and renders only the zoomed pane's `PaneNode` at full size when set — the binary tree structure is never modified.

While zoomed, layout-mutating actions are disabled (no-op): close, new tab, split, drag-and-drop, and open settings. Allowed actions: terminal I/O, rename, command palette, theme switching, and toggle zoom (un-zoom).

Triggered via "Toggle Zoom Pane" command (Cmd+Shift+M) or command palette. A "ZOOMED" badge in the tab bar indicates zoom is active.

## Consequences

- The layout tree is never modified during zoom, eliminating an entire class of state consistency bugs (e.g., session closes while zoomed, new session created while zoomed).
- Disabling layout-mutating actions while zoomed is simple — each action checks `if (zoomedPaneId) return`.
- The zoom command is conditionally hidden from the palette when only one pane exists, preventing a confusing no-op.
- Un-zoom always restores the exact previous layout since nothing changed.
- The trade-off: users cannot create new tabs or close tabs while zoomed. This matches VS Code's behavior where zoomed editor groups restrict certain actions.
