# ADR-002: Binary Tree Layout with react-resizable-panels

## Status

Accepted

## Context

We needed VS Code-style split panes: drag a tab to a pane edge to split, drop in the center to merge, recursive splits in any direction, per-pane tab bars, and auto-collapse when a pane empties. The resize interaction needed to be production-quality (draggable separators, min/max constraints, keyboard accessible).

Two approaches were considered: building resize from scratch with pointer event tracking, or using a proven resize library and layering our split/merge logic on top.

## Decision

We use a binary tree data model (`LayoutNode`) for the pane layout and `react-resizable-panels` for the resize layer.

The tree is either a `leaf` (single pane) or a `split` (direction + ratio + two children). Drop zones are computed from cursor position relative to the pane's bounding rect: 10% edge bands trigger splits, the center 80% triggers merge. Left/right edge checks take priority over top/bottom at corners.

`react-resizable-panels` provides `<Group>`, `<Panel>`, and `<Separator>` components. Our `LayoutRenderer` recursively maps the tree: leaves become Panels containing a `PaneNode`, splits become Groups with two Panels and a Separator. The library handles drag interaction, cursor management, min/max constraints, proportional resizing on window resize, and keyboard accessibility.

We build: binary tree state management (`useLayout`), drag-and-drop logic (`DragContext` + drop indicator), per-pane tab bars (`PaneTabBar`), and the recursive renderer (`LayoutRenderer`).

## Consequences

- The binary tree model makes split, merge, and collapse operations straightforward tree transformations.
- `react-resizable-panels` eliminates a significant amount of pointer event handling, accessibility, and edge-case code we would have had to build and maintain.
- Direction terminology requires mapping: our tree's `vertical` (side by side) maps to react-resizable-panels' `horizontal` orientation, and vice versa.
- Drop indicators are purely visual (`pointer-events: none`) with zero interference to terminal input when not dragging.
- Layout state is client-side — a browser refresh resets to a single pane (mitigated later by ADR-008).
