import * as k8s from '@kubernetes/client-node';
import { loadConfig } from './config.js';
import { WorkspaceStore } from './workspace-store.js';
import { ChemuxerClient } from './chemuxer-client.js';
import { createApp } from './app.js';

const config = loadConfig();

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const namespace = config.namespace ?? kc.getContextObject(kc.getCurrentContext())?.namespace;
if (!namespace) {
  console.error('[chemuxer-mcp] No namespace configured and none found in kubeconfig context');
  process.exit(1);
}

const store = new WorkspaceStore(kc, namespace, config.chemuxerDefaultPort);
const client = new ChemuxerClient({ timeoutMs: config.requestTimeoutMs });

try {
  await store.start();
} catch (err) {
  console.error('[chemuxer-mcp] Failed to start workspace store:', err);
  process.exit(1);
}

const server = createApp({ store, client });
try {
  await server.start(config.port, config.host);
} catch (err) {
  console.error('[chemuxer-mcp] Failed to start server:', err);
  process.exit(1);
}
console.log(`[chemuxer-mcp] Listening on ${config.host}:${config.port} (namespace: ${namespace})`);

let exiting = false;
function onSignal(signal: string): void {
  if (exiting) return;
  exiting = true;
  console.log(`[chemuxer-mcp] Received ${signal}, shutting down...`);

  setTimeout(() => {
    console.error('[chemuxer-mcp] Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 10_000).unref();

  server
    .shutdown()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[chemuxer-mcp] Shutdown error:', err);
      process.exit(1);
    });
}

process.on('SIGTERM', () => onSignal('SIGTERM'));
process.on('SIGINT', () => onSignal('SIGINT'));
