# Specification: chemuxer-mcp stdio Transport & Local Run Mode

**Issue:** akurinnoy/agentic-workspaces#159
**Date:** 2026-06-25
**Status:** Approved (LLM Council cross-model verdict)

## Problem

chemuxer-mcp only supports SSE transport (HTTP server on port 3001). To use it from a local Claude Code session, you need `oc port-forward svc/chemuxer-mcp 3001:3001` running in the background. This is fragile (port-forward drops on network interruptions) and adds setup friction.

che-mcp-server (a sibling project) supports stdio transport — run `node dist/index.js` locally, it connects to the cluster via kubeconfig, and Claude Code talks to it over stdin/stdout. No port-forward needed.

## Design

### 1. Transport Configuration

Add a `transport` field to config with CLI args as highest precedence:

- **Config field:** `transport: 'stdio' | 'sse'`, default `'stdio'`
- **CLI args:** `--transport`, `--port` (port only used in sse mode)
- **Env vars:** `CHEMUXER_MCP_TRANSPORT`, `PORT` (existing env vars continue to work)
- **Precedence:** CLI args > env vars > defaults
- **Namespace:** required for sse mode; resolved from current kubeconfig context in stdio mode

Keep the existing zod schema pattern. Add transport and adjust namespace to be optional (derived from kubeconfig context when in stdio mode).

### 2. Pod Connectivity: Pod Proxy Subresource

**Use the Kubernetes API Server Pod Proxy subresource**, not port-forward.

- In-cluster (sse mode): `http://${podIP}:${port}/api/sessions` (current behavior, unchanged)
- Local (stdio mode): `${apiServerUrl}/api/v1/namespaces/${namespace}/pods/${podName}:${port}/proxy/api/sessions`, authenticated via kubeconfig credentials

**Rationale:** Zero local port management. No connection lifecycle. No cleanup on process exit. No port collisions. The existing `ChemuxerClient` fetch-based HTTP calls work with a URL prefix swap. The K8s API server handles routing, auth, and TLS.

**Abstraction:** `WorkspaceStore` returns pod metadata (pod name, namespace, container port) instead of endpoint URLs. `ChemuxerClient` receives a URL construction strategy (direct pod IP vs. API server proxy path) and builds request URLs accordingly. The strategy is selected based on transport config at startup.

**RBAC requirement:** Local mode requires the kubeconfig user to have `pods/proxy` permission (verb: `get`) in the target namespace. The implementation should surface a clear error when the permission is missing.

### 3. WorkspaceInfo Contract Change

Currently `WorkspaceInfo` has an `endpoint` string field set by `WorkspaceStore`. Change this:

- `WorkspaceStore` populates pod metadata: `podName`, `namespace`, `containerPort`
- Endpoint URL construction moves to `ChemuxerClient` (or an injected strategy)
- The 7 tool implementations continue to pass workspace references to `ChemuxerClient` methods; they do not construct URLs themselves
- This change is internal to the tool layer — tool signatures and MCP-facing behavior do not change

### 4. HTTP Transport: Keep SSE

Do not upgrade to StreamableHTTP in this issue. The existing SSE transport (`/sse`, `/messages` endpoints) works, is deployed, has 83 passing tests, and changing it violates the backward compatibility constraint. File a separate issue for StreamableHTTP migration if desired.

### 5. Entry Point Structure

```
if (config.transport === 'sse') {
  // Existing Express app + SSE transport
  // DirectPodConnector strategy (pod IP URLs)
  // Health endpoints (/healthz, /readyz)
  // Listen on config.port
} else {
  // StdioServerTransport
  // ApiServerProxyStrategy (pod proxy URLs via kubeconfig)
  // No HTTP server, no health endpoints
  // Register same 7 tools on McpServer
  // Signal handlers for graceful shutdown
}
```

### 6. Health Endpoints

No health endpoints in stdio mode. The MCP protocol's initialize/ping handles liveness. The parent process (Claude Desktop, IDE extension, etc.) manages the child process lifecycle via OS signals.

### 7. Streaming Compatibility

`ChemuxerClient.getFeed()` uses streaming HTTP responses. The K8s pod proxy subresource supports this — it proxies the full HTTP response including streaming. The implementation must include integration tests confirming streaming through the proxy path.

### 8. Backward Compatibility

- All existing behavior is the `sse` + direct pod IP path. Zero changes to that path.
- Existing 83 tests target that path and remain untouched.
- Existing Kubernetes deployment manifests should add `CHEMUXER_MCP_TRANSPORT=sse` (or `--transport sse`) explicitly, since the new default is `stdio`. This is the one required change to existing deployments.
- No breaking type changes in `packages/shared`.

### 9. New Test Coverage

- Config precedence (CLI > env > defaults)
- Transport selection and entry point branching
- Pod proxy URL construction (given pod metadata, verify correct proxy URL)
- API server proxy request routing in `ChemuxerClient`
- Stdio startup and shutdown lifecycle
- Error handling when RBAC permissions are insufficient
- Streaming through pod proxy path

### 10. Items Explicitly Out of Scope

- SSE to StreamableHTTP migration (separate issue)
- VPN/direct pod IP access in local mode (unsupported; use pod proxy)
- Auto-detection of in-cluster vs. local (explicit config only)
- TLS configuration for API server communication (handled by `@kubernetes/client-node` kubeconfig loading)

## Files to Modify

| File | Change |
|------|--------|
| `packages/chemuxer-mcp/src/config.ts` | Add transport field, CLI arg parsing, env var support |
| `packages/chemuxer-mcp/src/index.ts` | Branch by transport: sse (existing) vs stdio (new) |
| `packages/chemuxer-mcp/src/app.ts` | Extract `createMcpServer()` so both paths can reuse it |
| `packages/chemuxer-mcp/src/workspace-store.ts` | Return pod metadata instead of endpoint URLs |
| `packages/chemuxer-mcp/src/chemuxer-client.ts` | Accept URL construction strategy; add pod proxy support |
| `packages/chemuxer-mcp/src/tools/*.ts` | Update to pass workspace info (not endpoint string) to client |
| `packages/chemuxer-mcp/src/__tests__/config.test.ts` | New tests for transport config |
| `packages/chemuxer-mcp/src/__tests__/*.test.ts` | Update tests for WorkspaceInfo contract change |
| `deploy/` | Add `CHEMUXER_MCP_TRANSPORT=sse` to deployment manifests |

## Validation

- All 83 existing tests pass unchanged (sse path untouched)
- New tests cover stdio path, config precedence, pod proxy URL construction
- `claude mcp add chemuxer-mcp -- node packages/chemuxer-mcp/dist/index.js` works from a local machine
- `npm start -w packages/chemuxer-mcp` with `CHEMUXER_MCP_TRANSPORT=sse` works identically to current behavior

## Council Notes

*Council composition: Claude Opus 4.6, Gemini 3 Pro (gemini-3-pro-preview), GPT-5.3 Codex*

Key insight from Gemini (rated strongest by all reviewers): Pod Proxy subresource eliminates the entire port-forward lifecycle management problem. All three reviewers independently confirmed this is superior to the PortForward API approach.
