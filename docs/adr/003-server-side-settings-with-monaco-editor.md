# ADR-003: Server-Side Settings with Monaco Editor

## Status

Accepted

## Context

We needed a settings system for terminal font, theme, shell path, and scrollback configuration. Three approaches were considered:

1. Client-only settings in localStorage — simple but lost on different browsers/devices.
2. Server-side settings with a form-based UI — persistent but requires building form components for every setting.
3. Server-side settings with a code editor — persistent and automatically supports any JSON-expressible setting without custom UI.

## Decision

Settings are stored server-side as a JSON file (`./config/settings.json`), served via REST API (`GET/PUT /api/settings`), and edited in the browser using a Monaco editor tab with JSON Schema validation.

- **SettingsManager** reads/writes the config file, deep-merges partial configs with defaults, validates against a JSON Schema, clamps out-of-range values, and watches the file for external changes.
- **Settings broadcast:** changes are pushed to all connected clients via a `settings-changed` WebSocket message on the control channel.
- **Monaco editor** loads the JSON Schema for autocomplete, inline validation, and hover hints. Cmd+S sends a PUT request.
- **Tab model:** the pane `entries` array uses a discriminated union (`TabEntry = { type: 'terminal'; ... } | { type: 'settings' }`) to support the settings tab alongside terminal tabs. The settings tab is a singleton across all panes.

Settings scope: terminal font family/size, color theme key, shell path override, scrollback lines. All settings are global (no per-pane or per-session overrides).

## Consequences

- The Monaco editor eliminates the need to build and maintain form UI for each setting — adding a new setting only requires updating the type, defaults, and JSON Schema.
- Server-side storage means settings persist across browsers and survive container restarts.
- The JSON Schema serves double duty: Monaco validation in the browser and server-side validation on PUT.
- Shipping Monaco adds ~2MB to the frontend bundle, but it's loaded on demand (only when the settings tab opens).
- External file changes (e.g., `vim config/settings.json`) are detected via `fs.watch` and broadcast, enabling non-browser configuration workflows.
