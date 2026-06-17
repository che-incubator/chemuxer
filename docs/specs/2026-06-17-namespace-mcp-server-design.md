# Namespace-Level MCP Server for Agent Oversight — Specification

**Issue:** akurinnoy/agentic-workspaces#91
**ADR:** [ADR-010](../adr/010-namespace-level-mcp-server-for-agent-oversight.md)
**Date:** 2026-06-17

## 1. Problem

Agents need unified oversight of terminal sessions distributed across multiple DevWorkspace pods within a Kubernetes namespace. Today, each Chemuxer instance is isolated inside its workspace pod. An agent must know which workspaces exist, attach to the correct one, and manage its own connections. The namespace-level MCP server aggregates all workspace Chemuxer APIs behind a single MCP interface, enabling an agent to discover, inspect, and interact with any terminal in any workspace through one connection.

## 2. Architecture

```
  Claude Code (MCP Client)
       |
       | SSE (via kubectl port-forward)
       v
  +-----------------------+
  | chemuxer-mcp pod      |
  | (1 per namespace)     |
  |                       |
  | MCP SSE Server        |
  | K8s Informer Cache    |
  | Fan-out Proxy Client  |
  +-----------------------+
       |          |          |
       v          v          v
  [ws-pod-1]  [ws-pod-2]  [ws-pod-N]
  Chemuxer    Chemuxer    Chemuxer
  REST API    REST API    REST API
```

**Transport: SSE over HTTP.** The MCP server exposes an SSE endpoint. Clients connect via `kubectl port-forward <mcp-pod> <local-port>:<sse-port>`. Stdio is impractical for an in-cluster service. Streamable-HTTP is deferred until MCP client support is universal.

**Stateless.** The pod holds no persistent state. The informer cache is rebuilt on startup. All terminal state lives in workspace Chemuxer instances.

## 3. MCP Tool Schema

All tool names use `snake_case` per MCP convention. The `workspace` parameter accepts the DevWorkspace name (human-readable, unique within namespace). Every tool response that targets a specific workspace includes a `workspace_status` field for immediate health context.

### 3.1 `list_workspaces`

```
Parameters: none
Returns: {
  workspaces: WorkspaceSummary[]
}

WorkspaceSummary = {
  workspace_id: string,      // controller.devfile.io/devworkspace_id label
  workspace_name: string,    // controller.devfile.io/devworkspace_name label
  pod_name: string,
  phase: string,             // Running | Starting | Stopping | Stopped | Failed
  ready: boolean,
  idled: boolean,
  endpoint: string | null,   // null when not ready
  reason?: string            // human-readable reason when not ready/idled
}
```

### 3.2 `list_terminals`

```
Parameters: {
  workspace: string          // required, DevWorkspace name
}
Returns: {
  sessions: SessionInfo[],
  workspace_status: WorkspaceStatus
}
```

### 3.3 `get_terminal_output`

```
Parameters: {
  workspace: string,         // required
  session_id: string,        // required
  max_bytes?: number         // default 16384 (16 KB), max 65536
}
Returns: {
  content: string,           // ANSI-stripped plain text
  truncated: boolean,        // true if output exceeded max_bytes
  workspace_status: WorkspaceStatus
}
```

### 3.4 `send_terminal_input`

```
Parameters: {
  workspace: string,         // required
  session_id: string,        // required
  input: string              // required, text to send (may include \n)
}
Returns: {
  accepted: true,
  workspace_status: WorkspaceStatus
}
```

### 3.5 `create_terminal`

```
Parameters: {
  workspace: string,         // required
  shell?: string,            // e.g. "/bin/bash", "/bin/zsh"
  title?: string
}
Returns: {
  session: SessionInfo,
  workspace_status: WorkspaceStatus
}
```

### 3.6 `close_terminal`

```
Parameters: {
  workspace: string,         // required
  session_id: string         // required
}
Returns: {
  closed: true,
  workspace_status: WorkspaceStatus
}
```

### 3.7 `get_activity_feed`

```
Parameters: {
  workspace?: string,        // optional; omit for cross-workspace feed
  session_id?: string,       // optional; requires workspace
  since?: string             // ISO 8601 timestamp
}
Returns: {
  entries: FeedEntry[],      // each entry includes workspace_name field
  next_since: string,
  partial_failures?: WorkspaceError[]  // only present on cross-workspace calls
}
```

### 3.8 Shared Types

```
WorkspaceStatus = {
  workspace_name: string,
  ready: boolean,
  phase: string,
  idled: boolean
}

WorkspaceError = {
  workspace_name: string,
  error_code: ErrorCode,
  message: string
}

ErrorCode = "WORKSPACE_NOT_FOUND"
           | "WORKSPACE_NOT_READY"
           | "WORKSPACE_UNREACHABLE"
           | "WORKSPACE_IDLED"
           | "TERMINAL_NOT_FOUND"
           | "UPSTREAM_TIMEOUT"
           | "UPSTREAM_ERROR"
```

## 4. Workspace Discovery

### 4.1 Informer Configuration

Watch `v1/Pod` resources in the MCP server's own namespace with label selector:

```
controller.devfile.io/devworkspace_id
```

(Label existence selector — matches any pod that has this label, regardless of value.)

### 4.2 Metadata Extraction

From each watched pod:

| Field | Source |
|-------|--------|
| `workspace_id` | Label `controller.devfile.io/devworkspace_id` |
| `workspace_name` | Label `controller.devfile.io/devworkspace_name` |
| `pod_name` | `metadata.name` |
| `phase` | `status.phase` |
| `ready` | `status.conditions` where `type=Ready` and `status=True` |
| `idled` | Annotation `idling.devfile.io/idled` exists and equals `"true"` |
| `endpoint` | `status.podIP` + Chemuxer port |

### 4.3 Port Resolution Order

1. Container port named `chemuxer-http` in pod spec
2. Environment variable `CHEMUXER_PORT` on the first container
3. Default: `7681`

### 4.4 Routing Rules

- **Ready pods**: fully routable, all tools work.
- **Non-ready pods**: returned by `list_workspaces` with `ready: false` and `reason`. Tools targeting non-ready workspaces return `WORKSPACE_NOT_READY` error immediately without attempting a network call.
- **Idled pods**: returned with `idled: true`. Tools return `WORKSPACE_IDLED` error.

## 5. Fan-out Proxy

### 5.1 Request Flow

Single-workspace tools (`list_terminals`, `get_terminal_output`, etc.): resolve workspace name to endpoint via informer cache, proxy HTTP request to Chemuxer REST API, transform response to MCP tool result.

Cross-workspace tools (`list_workspaces`, `get_activity_feed` without workspace filter): fan out to all ready workspaces in parallel.

### 5.2 Concurrency and Timeouts

- Per-workspace request timeout: **2 seconds** (fail-fast).
- Fan-out concurrency cap: **10 parallel requests**. Remaining workspaces are queued.
- Total fan-out timeout budget: **5 seconds**. Any workspace not responding within the budget is reported in `partial_failures`.

### 5.3 Activity Feed Merging

Cross-workspace `get_activity_feed` merges entries from multiple workspaces into a single chronologically sorted array by `timestamp`. Each `FeedEntry` is augmented with `workspace_name`. Entries with identical timestamps are ordered by workspace name for determinism.

## 6. Error Handling

Errors are returned as MCP tool errors with structured `error_code` and `message` fields.

| Scenario | Error Code | Behavior |
|----------|-----------|----------|
| Workspace name not in informer cache | `WORKSPACE_NOT_FOUND` | Immediate error, no network call |
| Pod exists but not Ready | `WORKSPACE_NOT_READY` | Immediate error, includes `reason` |
| Pod is idled | `WORKSPACE_IDLED` | Immediate error |
| Network timeout (>2s) | `UPSTREAM_TIMEOUT` | Connection closed, error returned |
| Chemuxer returns 5xx | `UPSTREAM_ERROR` | Error with status code in message |
| Session ID not found | `TERMINAL_NOT_FOUND` | Proxied 404 mapped to typed error |
| Fan-out partial failure | N/A | Success response with `partial_failures[]` |

Fan-out tools never fail entirely due to individual workspace failures. They return results from healthy workspaces and report failures in `partial_failures[]`.

## 7. Security Considerations

Full security design is out of scope for this spec and should be addressed in a dedicated security ADR before production deployment. Minimum requirements:

- The MCP server's ServiceAccount has **read-only pod access** (get/list/watch) in its namespace only.
- The MCP SSE endpoint is **not exposed via Service/Ingress** in the initial implementation. Access is exclusively via `kubectl port-forward`.
- Chemuxer REST APIs within workspace pods are accessed over the pod network (cluster-internal). No additional authentication is required because the MCP pod and workspace pods share a namespace.

## 8. Health Probes

| Probe | Path | Condition |
|-------|------|-----------|
| Liveness | `GET /healthz` | HTTP server event loop is responsive |
| Readiness | `GET /readyz` | Informer has completed initial list sync |

## 9. Kubernetes Manifests

| Resource | Purpose |
|----------|---------|
| `Deployment` | 1 replica, stateless, `packages/chemuxer-mcp` image |
| `ServiceAccount` | Identity for informer API access |
| `Role` | `get`, `list`, `watch` on `pods` in namespace |
| `RoleBinding` | Binds Role to ServiceAccount |
| `ConfigMap` | Tunable values: default Chemuxer port, request timeout, fan-out concurrency cap, max output bytes |
| `Service` | ClusterIP exposing SSE port (for optional in-cluster access) |

No Ingress or Route. External access is via `kubectl port-forward`.

## 10. Testing Strategy

### Unit Tests
- Tool parameter validation (required fields, type coercion, defaults).
- Error code mapping from HTTP status codes to `ErrorCode` enum.
- Activity feed merge algorithm: chronological sort, workspace augmentation, deterministic ordering.
- Output truncation logic: `max_bytes` boundary, `truncated` flag accuracy.

### Integration Tests
- Mock Kubernetes API with `@kubernetes/client-node` test fixtures.
- Verify informer cache correctly adds, updates, and removes workspace entries on pod lifecycle events.
- Spin up mock Chemuxer HTTP servers, verify fan-out proxying returns correct results and handles mixed success/failure scenarios.
- Verify `partial_failures` array population when subset of workspaces are unreachable.

### E2E Tests
- Deploy to a test namespace with real DevWorkspace pods running Chemuxer.
- Connect MCP client via `kubectl port-forward`.
- Exercise full tool lifecycle: list workspaces, list terminals, create terminal, send input, read output, close terminal.
- Validate partial-failure behavior by stopping one workspace mid-test.

## 11. Migration Sequence

**Phase 1: Monorepo Restructure** (zero behavior change)
1. Create `packages/chemuxer/`, `packages/shared/`, `packages/chemuxer-mcp/` directories.
2. Move all existing Chemuxer source into `packages/chemuxer/`.
3. Extract `SessionInfo`, `FeedEntry`, `FeedResponse` and settings types into `packages/shared/`.
4. Update all imports in `packages/chemuxer/` to reference `packages/shared/`.
5. Verify existing Chemuxer builds, tests, and Docker image are unaffected.

**Phase 2: MCP Server Implementation**
1. Scaffold `packages/chemuxer-mcp/` with MCP SDK, SSE transport, informer, and proxy client.
2. Implement tools incrementally: `list_workspaces` first (validates informer), then read tools, then write tools.
3. Add Kubernetes manifests to `packages/chemuxer-mcp/deploy/`.

**Phase 3: Validation**
1. Deploy to a dev namespace alongside real workspaces.
2. Run E2E test suite.
3. Document `kubectl port-forward` usage for Claude Code MCP configuration.

## 12. Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK with SSE transport
- `@kubernetes/client-node@1.4.0` — Kubernetes API client with Informer support (verified: no CVEs)
