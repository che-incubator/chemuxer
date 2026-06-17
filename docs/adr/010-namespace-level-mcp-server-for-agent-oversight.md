# ADR-010: Namespace-level MCP server for agent oversight

- **Date**: 2026-06-16
- **Status**: Accepted
- **Deciders**: @akurinnoy, cross-model LLM council (Claude Opus 4.6, Gemini 3 Pro, GPT-5.3 Codex)
- **Tags**: architecture, mcp, kubernetes, agent-observability, monorepo

## Context and Problem Statement

Chemuxer runs as a sidecar in Eclipse Che workspace pods, one instance per workspace. We are adding MCP (Model Context Protocol) support so AI agents can interact with terminal sessions programmatically. The primary use case is an external personal agent (e.g., Claude Code running on the user's laptop) that wants a single pane of glass to observe and manage terminal sessions across multiple workspaces simultaneously — an overseer pattern, not cross-workspace agent communication.

Two sub-decisions were made: (1) deployment model (per-workspace vs per-namespace), and (2) project structure (separate repo vs monorepo).

## Decision Drivers

- Personal agent runs externally (laptop), not inside any workspace
- Eclipse Che creates one namespace per user with multiple workspace pods
- `kubectl port-forward` is the documented access pattern for external agents
- Workspaces start, stop, and idle dynamically — the agent shouldn't manage this lifecycle
- In-cluster pod-to-pod communication within a namespace requires no gateway auth
- Solo developer, incubator stage — iteration speed over governance
- Both components are TypeScript and share REST API types (SessionInfo, FeedEntry, etc.)
- Chemuxer's REST API is still actively evolving

## Considered Options

### Deployment model
- **MCP server per workspace** — each Chemuxer instance runs its own MCP server
- **Single MCP server per user namespace** — one aggregator pod discovers and proxies all workspaces

### Project structure
- **Separate repo** (`che-incubator/chemuxer-mcp`) — independent lifecycle, matches org convention
- **Subdirectory** (`chemuxer/mcp-server/`) — nested inside Chemuxer
- **Monorepo** (`packages/chemuxer/` + `packages/chemuxer-mcp/` + `packages/shared/`) — siblings with shared types

## Decision Outcome

**Deployment:** Chosen option: **"Single MCP server per user namespace"**, because server-side aggregation is the correct pattern for external oversight — pushing workspace discovery and lifecycle management to the laptop agent is architecturally wrong.

**Project structure:** Chosen option: **"Monorepo with npm workspaces"**, because active API iteration between Chemuxer and the MCP server makes cross-repo type sync pure friction for a solo developer. The MCP server is a REST API client that shares interface types — npm workspaces give direct imports without a published package.

### Positive Consequences

- One port-forward, one MCP connection — all workspaces visible
- Workspace lifecycle (start/stop/idle) handled server-side, transparent to the agent
- Kubernetes-native discovery via Informer on DevWorkspace-labeled pods
- Namespace-scoped RBAC keeps permissions minimal (get/list/watch Pods)
- Stateless design — no PVC, no database, restarts re-discover everything
- Shared TypeScript types via workspace imports — API changes compile-checked across both packages
- One clone, one issue tracker, one PR view for related changes

### Negative Consequences

- New pod to deploy and maintain per user namespace
- Must handle partial failures (one workspace unreachable shouldn't block others)
- Workspace idle/wake needs explicit handling — the MCP server bypasses the Che gateway that normally triggers scale-from-zero
- Requires migrating existing repo structure into `packages/chemuxer/`
- Breaks che-incubator one-repo-per-component convention (acceptable for incubator/solo developer)
- CI needs path filters to avoid unnecessary builds

## Pros and Cons of the Options

### Single MCP server per namespace ✅ Chosen

- ✅ One connection point for external agents
- ✅ Server-side workspace discovery and lifecycle handling
- ✅ In-cluster routing avoids Che gateway auth complexity
- ✅ Stateless — thin routing proxy over existing Chemuxer REST APIs
- ❌ New component to deploy and operate
- ❌ Must handle workspace idle state (no pod to route to)

### MCP server per workspace

- ✅ Zero new infrastructure — in-process with existing Chemuxer
- ✅ Simpler implementation — direct access to sessions
- ❌ N port-forwards required, reconfigured on workspace lifecycle changes
- ❌ Discovery complexity pushed to the external agent
- ❌ No unified view across workspaces without client-side aggregation

### Monorepo ✅ Chosen

- ✅ Shared types via workspace imports — no duplication, compile-time checks
- ✅ One clone, atomic PRs for API changes touching both packages
- ✅ npm workspaces is sufficient tooling (no Turborepo/Nx needed)
- ✅ Future extraction into separate repos is straightforward from clean sibling packages
- ❌ Requires one-time repo restructuring
- ❌ CI path filters needed to avoid cross-package rebuilds

### Separate repo

- ✅ Independent lifecycle, matches org convention
- ✅ No migration cost
- ❌ Cross-repo friction for every API type change
- ❌ Types duplicated or require a published shared package

### Subdirectory

- ✅ No migration, can import from shared/ directly
- ❌ False hierarchy — MCP server is a client, not a subcomponent
- ❌ Harder to extract later than sibling packages

## Design Notes

- **Repo structure**:
  ```
  chemuxer/
    packages/
      chemuxer/          # existing terminal multiplexer
      chemuxer-mcp/      # namespace-level MCP proxy
      shared/            # pure TypeScript interfaces only
    package.json         # "workspaces": ["packages/*"]
    tsconfig.json        # project references
  ```
- **Tooling**: npm workspaces + TypeScript project references. No Turborepo/Nx.
- **Discovery**: Kubernetes Informer (watch, not poll) on pods with DevWorkspace labels
- **Proxying**: synchronous fan-out to per-workspace Chemuxer REST APIs; add buffering only when measured
- **MCP tools**: `listWorkspaces()`, `listTerminals(workspace)`, `getTerminalOutput(workspace, terminalId)`, `sendInput(workspace, terminalId, input)` — all workspace-qualified
- **CI**: GitHub Actions with path filters per package
- **Extraction triggers**: split into separate repos when external adopters appear, release cadence diverges, or separate maintainers join
- **Deferred**: event bus/caching, wake-on-demand for idled workspaces, multi-user auth, network policies

## Links

- [ADR-009: REST API for agent observability](009-rest-api-for-agent-observability.md)
- [Issue #91: implement namespace-level MCP server](https://github.com/akurinnoy/agentic-workspaces/issues/91)
