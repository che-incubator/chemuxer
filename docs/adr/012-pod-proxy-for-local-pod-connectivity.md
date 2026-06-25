# ADR-012: K8s pod proxy subresource for local pod connectivity

- **Date**: 2026-06-25
- **Status**: Superseded
- **Deciders**: @akurinnoy, cross-model LLM council (Claude Opus 4.6, Gemini 3 Pro, GPT-5.3 Codex)
- **Tags**: kubernetes, networking, architecture
- **Superseded by**: [ADR-013](013-portforward-for-local-pod-connectivity.md)

## Context and Problem Statement

When chemuxer-mcp runs locally (stdio mode via kubeconfig), it needs to reach Chemuxer REST APIs running inside workspace pods. In-cluster, the server uses direct pod IPs (`http://10.0.0.5:7681/api/sessions`). Pod IPs are not routable from outside the cluster.

We need a mechanism for local-to-pod HTTP communication that works through the Kubernetes API.

## Decision Drivers

- Must work with any Kubernetes cluster (OpenShift, vanilla K8s, managed)
- Should not require managing local ports or TCP tunnels
- Must support streaming HTTP responses (used by `getFeed()`)
- Should minimize code complexity — the existing `ChemuxerClient` uses `fetch()` for all calls
- Multiple workspace pods may be active simultaneously

## Considered Options

1. **`@kubernetes/client-node` PortForward API** — create ephemeral TCP tunnels to each pod, then hit `localhost:randomPort`
2. **K8s API server pod proxy subresource** — rewrite URLs to `${apiServer}/api/v1/namespaces/${ns}/pods/${pod}:${port}/proxy/...`
3. **kubectl exec-based HTTP proxy** — tunnel HTTP through exec streams (complex, fragile)

## Decision Outcome

**Option 2: Pod proxy subresource.**

The K8s API server natively proxies HTTP requests to pods via the `/proxy/` subresource path. The URL transformation is:

- In-cluster: `http://${podIP}:${port}/api/sessions`
- Local: `${apiServerUrl}/api/v1/namespaces/${ns}/pods/${podName}:${port}/proxy/api/sessions`

Authentication is handled by applying kubeconfig credentials (Bearer token) to each request via `KubeConfig.applyToHTTPSOptions()`.

## Supersession Note

**This decision has been superseded.** The pod proxy approach encountered issues with port naming (specifically, endpoints published as `7681-https` in Kubernetes service discovery caused routing failures). The PortForward API was implemented instead, providing better compatibility with modern Kubernetes deployments while eliminating the need for kubeconfig authentication in local mode.

### Why not port-forward?

Port-forward (Option 1) requires:
- Managing ephemeral local TCP ports per pod
- Handling port collisions across concurrent connections
- Connection lifecycle management (open, cache, close, reconnect)
- Cleanup on process exit to avoid leaked sockets
- Caching local port ↔ pod mappings

Pod proxy requires none of this — it is a URL prefix swap. The existing `fetch()`-based HTTP calls work unchanged. The K8s API server handles routing, auth, and TLS.

### Implementation

An `EndpointResolver` interface abstracts URL construction:
- `DirectEndpointResolver` — returns pod IP URLs (in-cluster, SSE mode)
- `PodProxyEndpointResolver` — builds API server proxy URLs (local, stdio mode)

The resolver is injected at startup based on transport config. Tools and `ChemuxerClient` are unaware of which strategy is active.

### RBAC

Local mode requires the kubeconfig user to have `pods/proxy` permission (verb: `get`) in the target namespace. The existing ServiceAccount RBAC (for on-cluster mode) does not need this verb since it uses direct pod IPs.

### Consequences

**Good:**
- Zero local port management — no connection lifecycle, no cleanup, no port collisions
- Streaming works — pod proxy passes through the full HTTP response including chunked/SSE
- Minimal code change — URL prefix swap via `EndpointResolver`, no new dependencies
- Works with any K8s cluster that exposes the API server

**Bad:**
- Every request goes through the API server (additional hop vs direct pod IP)
- Requires `pods/proxy` RBAC permission (not granted by default)
- API server rate limits could theoretically affect high-frequency polling

**Neutral:**
- TLS termination is handled by kubeconfig — no custom cert management needed
