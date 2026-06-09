# ADR-005: CSS Custom Properties for Theming

## Status

Accepted

## Context

With the addition of a second color theme (catppuccin-latte alongside catppuccin-mocha), all UI chrome — tab bars, command palette, separators, context menus, banners — needed to respond to theme changes. Two approaches were considered:

1. CSS-in-JS or className toggling per theme per component.
2. CSS custom properties (variables) set once on `document.documentElement`, consumed everywhere via `var()`.

## Decision

We use 9 CSS custom properties (`--ch-base`, `--ch-mantle`, `--ch-crust`, `--ch-surface0`, `--ch-overlay0`, `--ch-text`, `--ch-subtext0`, `--ch-blue`, `--ch-red`) set on the root element via a `useEffect` in `App.tsx` that watches `settings.terminal.theme`.

The `TerminalTheme` type was extended with UI chrome fields alongside the 16 ANSI terminal colors. All hardcoded hex colors in `App.css` were replaced with `var(--ch-*)` references. Monaco editor uses its built-in `vs-dark` or `vs` theme based on the active theme name.

Adding a new theme only requires adding an entry to the `THEMES` map in `shared/settings.ts` — no CSS changes, no component changes.

## Consequences

- Theme switching is instant — one `useEffect` sets 9 variables, every styled element updates via CSS cascade.
- No per-component theme logic, className toggling, or CSS-in-JS runtime.
- New themes require only a data entry (colors map), not code changes.
- The approach is limited to color theming — layout or typography themes would need a different mechanism, but those are not in scope.
- Monaco has its own theming system, so we map to its built-in themes rather than applying CSS variables to the editor.
