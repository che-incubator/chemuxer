import * as k8s from '@kubernetes/client-node';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { WorkspaceStore } from './workspace-store.js';
import { ChemuxerClient } from './chemuxer-client.js';
import { createEndpointResolver } from './endpoint-resolver.js';
import { createApp, createMcpServer } from './app.js';

const config = loadConfig(process.argv.slice(2));

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const namespace = config.namespace ?? kc.getContextObject(kc.getCurrentContext())?.namespace;
if (!namespace) {
  console.error('[chemuxer-mcp] No namespace configured and none found in kubeconfig context');
  process.exit(1);
}

const store = new WorkspaceStore(kc, namespace, config.chemuxerDefaultPort);
const client = new ChemuxerClient({ timeoutMs: config.requestTimeoutMs });
const resolver = createEndpointResolver(config.transport, kc, namespace, config.chemuxerDefaultPort);

if (config.transport === 'http') {
  let authMiddleware: ((req: import('http').IncomingMessage, res: import('http').ServerResponse, next: () => Promise<void>) => Promise<void>) | undefined;

  if (config.authEnabled) {
    if (!namespace) {
      console.error('[chemuxer-mcp] Fatal: NAMESPACE is required when auth is enabled. Set NAMESPACE or set CHEMUXER_MCP_AUTH_ENABLED=false.');
      process.exit(1);
    }
    const { rawHttpK8sAuth, createDefaultK8sClient } = await import('@che-incubator/k8s-mcp-auth');
    const k8sClient = createDefaultK8sClient();
    authMiddleware = rawHttpK8sAuth({
      publicPaths: [
        { method: 'GET', path: '/healthz' },
        { method: 'GET', path: '/readyz' },
      ],
      namespace,
      k8sClient,
    });
    console.log('[chemuxer-mcp] K8s token authentication enabled');
  }

  const server = createApp({ store, client, resolver, authMiddleware });
  try {
    await server.start(config.port, config.host);
  } catch (err) {
    console.error('[chemuxer-mcp] Failed to start server:', err);
    process.exit(1);
  }
  console.log(`[chemuxer-mcp] Listening on ${config.host}:${config.port} (namespace: ${namespace})`);

  const STORE_START_RETRY_MS = 5_000;

  function startStoreInBackground(): void {
    store.start().then(
      () => console.log('[chemuxer-mcp] Workspace store synced'),
      (err) => {
        console.error('[chemuxer-mcp] Workspace store failed to start:', err);
        setTimeout(startStoreInBackground, STORE_START_RETRY_MS).unref();
      },
    );
  }

  startStoreInBackground();

  let exiting = false;
  function onSignal(signal: string): void {
    if (exiting) return;
    exiting = true;
    console.log(`[chemuxer-mcp] Received ${signal}, shutting down...`);

    setTimeout(() => {
      console.error('[chemuxer-mcp] Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 10_000).unref();

    Promise.allSettled([server.shutdown(), store.stop(), resolver.shutdown()])
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[chemuxer-mcp] Shutdown error:', err);
        process.exit(1);
      });
  }

  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
} else {
  // stdio mode
  console.error(`[chemuxer-mcp] Starting in stdio mode (namespace: ${namespace})`);

  await store.start();
  console.error('[chemuxer-mcp] Workspace store synced');

  const mcpServer = createMcpServer(store, client, resolver);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  let stdioExiting = false;
  function onStdioSignal(signal: string): void {
    if (stdioExiting) return;
    stdioExiting = true;
    console.error(`[chemuxer-mcp] Received ${signal}, shutting down...`);

    setTimeout(() => {
      console.error('[chemuxer-mcp] Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 10_000).unref();

    Promise.allSettled([mcpServer.close(), store.stop(), resolver.shutdown()])
      .then(() => process.exit(0));
  }

  process.on('SIGTERM', () => onStdioSignal('SIGTERM'));
  process.on('SIGINT', () => onStdioSignal('SIGINT'));
}
