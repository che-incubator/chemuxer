# chemuxer-mcp

Namespace-level MCP server for AI agent oversight of Chemuxer terminal sessions across DevWorkspace pods.

## How it works

A Kubernetes Informer watches DevWorkspace-labeled pods in the user's namespace, discovers running Chemuxer instances, and proxies requests to their REST APIs. The server exposes 7 MCP tools via SSE transport on port 3001, giving an external agent a single endpoint to manage terminals across multiple workspaces.

## Local development (stdio)

Run directly from a local checkout — no port-forward needed:

```bash
# Build
npm install && npm run build -w packages/shared && npm run build -w packages/chemuxer-mcp

# Register with Claude Code
claude mcp add chemuxer-mcp -- node packages/chemuxer-mcp/dist/index.js --namespace <your-namespace>

# Or run directly
NAMESPACE=my-namespace node packages/chemuxer-mcp/dist/index.js
```

Requires `pods/proxy` RBAC permission in the target namespace.

## On-cluster (SSE)

Port-forward the MCP service to your laptop:

```bash
kubectl port-forward svc/chemuxer-mcp 3001:3001 -n <your-namespace>
```

Then add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "chemuxer": {
      "type": "sse",
      "url": "http://localhost:3001/sse"
    }
  }
}
```

## Tools

| Tool | Description | Key Params |
|------|-------------|------------|
| `list_workspaces` | List DevWorkspace pods with status | — |
| `list_terminals` | List terminal sessions in a workspace | `workspace` |
| `get_terminal_output` | Get terminal buffer content (ANSI-stripped) | `workspace`, `session_id`, `max_bytes` |
| `send_terminal_input` | Send text to a terminal (include `\n` for Enter) | `workspace`, `session_id`, `input` |
| `create_terminal` | Create a new terminal session | `workspace` |
| `close_terminal` | Close a terminal session | `workspace`, `session_id` |
| `get_activity_feed` | Get recent terminal activity (single or cross-workspace) | `workspace` (optional), `since`, `limit` |

## Deploy

Prerequisites: a Kubernetes namespace with DevWorkspace pods running Chemuxer.

```bash
kubectl apply -f deploy/ -n <your-namespace>
```

Image: `quay.io/che-incubator/chemuxer-mcp:next`

The manifests create a Deployment, ServiceAccount with namespace-scoped pod read RBAC, ConfigMap, and ClusterIP Service.

## Configuration

Runtime tuning via environment variables (no image rebuild needed):

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | 3001 | HTTP/SSE server port |
| `HOST` | 0.0.0.0 | Bind address |
| `NAMESPACE` | (auto) | K8s namespace override (auto-detected from service account) |
| `CHEMUXER_DEFAULT_PORT` | 7681 | Default Chemuxer port on workspace pods |
| `REQUEST_TIMEOUT_MS` | 2000 | HTTP timeout for upstream Chemuxer calls |

## Development

```bash
# From the monorepo root
npm install
npm run build -w packages/shared
npm test -w packages/chemuxer-mcp    # 83 tests
npm run build -w packages/chemuxer-mcp
```

To run locally outside a K8s cluster, set the namespace explicitly:

```bash
NAMESPACE=my-namespace npm start -w packages/chemuxer-mcp
```
