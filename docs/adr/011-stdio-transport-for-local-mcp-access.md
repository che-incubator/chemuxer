# ADR-011: Stdio transport for local MCP access

- **Date**: 2026-06-25
- **Status**: Accepted
- **Deciders**: @akurinnoy, cross-model LLM council (Claude Opus 4.6, Gemini 3 Pro, GPT-5.3 Codex)
- **Tags**: mcp, transport, developer-experience
- **Supersedes**: Part of ADR-010 (which assumed SSE-only access via port-forward)

## Context and Problem Statement

chemuxer-mcp (ADR-010) originally only supported SSE transport over HTTP on port 3001. To use it from a local Claude Code session, developers needed `oc port-forward svc/chemuxer-mcp 3001:3001` running in the background. Port-forward connections drop on network interruptions, adding friction and unreliability.

The sibling project che-mcp-server solved this by supporting stdio transport — run `node dist/index.js` locally, it connects to the cluster via kubeconfig, and Claude Code talks to it over stdin/stdout. No port-forward needed.

## Decision Drivers

- Port-forward is fragile (drops on network interruptions, requires background process)
- che-mcp-server already established the stdio pattern — consistency matters
- Claude Code natively supports stdio MCP servers (`claude mcp add name -- command`)
- Kubeconfig-based auth is the standard for local Kubernetes tooling
- On-cluster SSE deployment must remain unchanged (backward compatibility)

## Considered Options

1. **SSE only + port-forward** — current approach, no code change
2. **Stdio + SSE dual transport with explicit config** — match che-mcp-server pattern
3. **Auto-detect transport** — sniff `KUBERNETES_SERVICE_HOST` to decide

## Decision Outcome

**Option 2: Dual transport with explicit config.**

- `--transport stdio|sse` CLI flag and `CHEMUXER_MCP_TRANSPORT` env var
- Default: `stdio` (optimized for the local developer use case)
- On-cluster deployments set `CHEMUXER_MCP_TRANSPORT=sse` explicitly
- No auto-detection — explicit config is less surprising than environment sniffing

### Consequences

**Good:**
- Local usage is zero-friction: `claude mcp add chemuxer-mcp -- node dist/index.js --namespace ns`
- No background port-forward process to manage
- Consistent with che-mcp-server's interface
- SSE path is unchanged — zero risk to existing deployments

**Bad:**
- Existing deployment manifests must add `CHEMUXER_MCP_TRANSPORT=sse` (one-time migration)
- Two code paths to maintain in the entry point

**Neutral:**
- stdio mode uses `console.error` for logging (stdout reserved for MCP protocol)
- Health endpoints (`/healthz`, `/readyz`) are SSE-only — stdio relies on MCP protocol liveness
