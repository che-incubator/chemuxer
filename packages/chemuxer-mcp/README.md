# chemuxer-mcp

Namespace-level MCP server for AI agent oversight of Chemuxer terminal sessions across DevWorkspace pods.

## How it works

A Kubernetes Informer watches DevWorkspace-labeled pods in the user's namespace, discovers running Chemuxer instances, and proxies requests to their REST APIs via K8s PortForward. The server exposes 9 MCP tools via stdio (local) or Streamable HTTP (on-cluster) transport, giving an external agent a single endpoint to manage terminals across multiple workspaces.

## Quick start (local — connecting to a remote cluster)

Connect to the in-cluster chemuxer-mcp from your local machine. The stdio bridge manages `oc port-forward` internally. Requires `oc login` to the target cluster.

```bash
# Via npx (no install needed)
claude mcp add chemuxer-mcp -- npx --package chemuxer-mcp chemuxer-mcp-bridge

# Or install globally
npm install -g chemuxer-mcp
claude mcp add chemuxer-mcp -- chemuxer-mcp-bridge
```

Configuration via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_NAMESPACE` | Kubernetes namespace | Current `oc project` |
| `MCP_SERVICE` | Service name | `chemuxer-mcp` |
| `MCP_PORT` | Service port | `3001` |

## Quick start (on-cluster)

### 1. Deploy

```bash
kubectl apply -f deploy/ -n <your-namespace>
```

This creates a Deployment, ServiceAccount, Role (pods + pods/portforward), RoleBinding, ConfigMap, and ClusterIP Service on port 3001.

### 2. Port-forward

```bash
kubectl port-forward svc/chemuxer-mcp 3001:3001 -n <your-namespace>
```

### 3. Connect Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "chemuxer-mcp": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### 4. Verify

```bash
claude /mcp
# Should show: Connected to chemuxer-mcp
```

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

Uses kubeconfig for auth. Connects to workspace pods via K8s PortForward API.

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
| `list_devfile_commands` | List exec commands from the workspace devfile | `workspace` |
| `run_devfile_command` | Run a devfile command in a new terminal session | `workspace`, `command_id` |

## RBAC requirements

The service account needs these permissions in the target namespace:

| Resource | Verbs | Why |
|----------|-------|-----|
| `pods` | get, list, watch | Discover workspace pods via Informer |
| `pods/portforward` | get, create | Reach Chemuxer inside workspace pods via K8s API |

## Deploy

Prerequisites: a Kubernetes namespace with DevWorkspace pods running Chemuxer.

```bash
kubectl apply -f deploy/ -n <namespace>
```

Image: `quay.io/che-incubator/chemuxer-mcp:next`

## Configuration

Runtime tuning via environment variables (set in `deploy/configmap.yaml`):

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | 3001 | HTTP server port |
| `HOST` | 0.0.0.0 | Bind address |
| `NAMESPACE` | (auto) | K8s namespace override (auto-detected from service account) |
| `CHEMUXER_DEFAULT_PORT` | 7681 | Default Chemuxer port on workspace pods |
| `REQUEST_TIMEOUT_MS` | 2000 | HTTP timeout for upstream Chemuxer calls |
| `CHEMUXER_MCP_TRANSPORT` | stdio | Transport mode: `stdio` or `http` |

## Development

```bash
# From the monorepo root
npm install
npm run build -w packages/shared
npm test -w packages/chemuxer-mcp
npm run build -w packages/chemuxer-mcp
```
