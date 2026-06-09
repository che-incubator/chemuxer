import path from 'path';
import http from 'http';
import express from 'express';
import { SessionManager } from './session-manager.js';
import { SettingsManager } from './settings-manager.js';
import { setupWebSocketServer } from './ws-handler.js';

const PORT = parseInt(process.env.PORT || '7681', 10);
const HOST = process.env.HOST || '127.0.0.1';
const STATIC_DIR = path.resolve(__dirname, '../client');

const configPath = path.join(process.cwd(), 'config', 'settings.json');
const settingsManager = new SettingsManager(configPath);

const app = express();
const server = http.createServer(app);
const manager = new SessionManager(settingsManager);

app.use(express.json());
app.use(express.static(STATIC_DIR));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/settings', (_req, res) => {
  res.json(settingsManager.getSettings());
});

app.put('/api/settings', (req, res) => {
  try {
    const updated = settingsManager.writeSettingsRaw(JSON.stringify(req.body));
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/settings/schema', (_req, res) => {
  res.type('application/json').send(settingsManager.getSchemaString());
});

// SPA fallback
app.get(/^(?!\/api\/)/, (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

setupWebSocketServer(server, manager, settingsManager);

// Create a default session so the user sees a terminal immediately
const initialSession = manager.createSession();
initialSession.onExit(() => {
  manager.closeSession(initialSession.id);
});

server.listen(PORT, HOST, () => {
  console.log(`chemuxer listening on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => {
  settingsManager.dispose();
  manager.closeAll();
  server.close(() => process.exit(0));
});
