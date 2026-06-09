# ADR-006: WebSocket Reconnection with Exponential Backoff

## Status

Accepted

## Context

If a WebSocket connection drops (server restart, network blip), the client loses all session awareness permanently — no reconnect attempt, no error UI, no recovery path. The user sees a frozen terminal with no indication of what happened or how to recover.

## Decision

A `useReconnectingWebSocket` hook wraps WebSocket creation with automatic reconnection:

- **Exponential backoff:** 1s, 2s, 4s, 8s, 16s, 30s (capped).
- **Reset on success:** backoff resets to 1s when a connection opens.
- **Countdown timer:** tracks and exposes seconds until the next attempt.
- **State exposed:** `{ ws, connected, retryIn }` for UI consumption.
- **`onMessage` callback:** attached immediately on socket creation (not in a React effect) to avoid missing the initial messages that arrive before effects run.
- **`binaryType = 'arraybuffer'`:** set on socket creation for binary terminal data.

Both the control channel (`useControl`) and terminal I/O channel (`Terminal.tsx`) use this hook. A `ConnectionBanner` component renders a red full-width banner with countdown when disconnected.

On IO reconnect, the server sends serialized terminal state (ADR-004), so session restore is automatic.

## Consequences

- Network blips and server restarts recover automatically without user intervention.
- The `onMessage` callback pattern avoids a React effect race condition where the initial server messages (session list, scrollback replay) arrive before `useEffect` attaches the handler — this was a regression that caused blank terminals.
- The disconnect banner provides clear user feedback with a countdown, replacing silent failure.
- Exponential backoff prevents thundering herd on server restarts.
- The hook manages dual tracking (`ws` state for React reactivity + `socketRef` for cleanup) which adds complexity but is necessary for correct lifecycle management.
