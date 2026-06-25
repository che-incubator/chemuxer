# ADR-013: PortForward API for local pod connectivity

- **Date**: 2026-06-25
- **Status**: Accepted
- **Deciders**: @akurinnoy, cross-model LLM council (Claude Opus 4.6, Gemini 3 Pro, GPT-5.3 Codex)
- **Tags**: kubernetes, networking, architecture
- **Supersedes**: [ADR-012](012-pod-proxy-for-local-pod-connectivity.md)

## Context and Problem Statement

ADR-012 chose the K8s API server pod proxy subresource for local-to-pod connectivity. This turned out to be broken: the DevWorkspace Operator names the container port `7681-https` (from `protocol: https` in the endpoint spec), which causes the API server to attempt HTTPS when proxying to the plain HTTP chemuxer backend. Requests hang and time out.

## Decision Drivers

- Pod proxy subresource is broken due to port naming (akurinnoy/agentic-workspaces#160)
- Must work without changes to the DevWorkspace Operator
- ChemuxerClient uses fetch()-based HTTP — the solution must preserve HTTP semantics
- Streaming responses (`getFeed()`) must work
- Multiple workspace pods may be active simultaneously

## Considered Options

1. **PortForward API** — `@kubernetes/client-node`'s PortForward creates TCP tunnels via WebSocket/SPDY
2. **kubectl exec** — run `curl` inside the pod via K8s Exec API (like che-mcp-server)

## Decision Outcome

**Option 1: PortForward API.** Unanimous council verdict.

A `PortForwardEndpointResolver` creates a local `net.Server` per pod, tunneling connections via `k8s.PortForward`. Tools call `http://127.0.0.1:{randomPort}/api/sessions` — the full HTTP contract (status codes, headers, streaming) is preserved with no changes to `ChemuxerClient`.

### Why not kubectl exec?

Exec would require building an HTTP-over-exec adapter. `getFeed()` streaming breaks through exec. Exec also requires `curl` in the workspace container — user-controlled images may not have it.

### Consequences

**Good:**
- Bypasses the `7681-https` port naming issue entirely
- Preserves the full HTTP contract — ChemuxerClient's fetch() works unchanged
- Streaming works through the TCP tunnel
- No dependency on container contents

**Bad:**
- Must manage TCP tunnel lifecycle per pod (create, cache, cleanup)
- First request per pod incurs ~660ms tunnel setup overhead
- `pods/portforward` RBAC required instead of `pods/proxy`

**Neutral:**
- Tunnels are cached by pod name — subsequent requests use the cached tunnel (~200-300ms)
- Stale tunnels from pod churn fail with ECONNREFUSED and are recreated on next call
