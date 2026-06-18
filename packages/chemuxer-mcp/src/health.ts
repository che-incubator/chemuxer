import { Router } from 'express';
import type { WorkspaceStore } from './workspace-store.js';

export function createHealthRouter(store: WorkspaceStore): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/readyz', (_req, res) => {
    if (store.synced) {
      res.json({ ok: true });
    } else {
      res.status(503).json({ ok: false, reason: 'Informer has not completed initial sync' });
    }
  });

  return router;
}
