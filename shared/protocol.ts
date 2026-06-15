import type { Settings } from './settings.js';

export interface SessionInfo {
  id: string;
  shell: string;
  title: string;
  renamed: boolean;
  createdAt: number;
}

// Client → Server on control channel
export type ClientControlMessage =
  | { type: 'create' }
  | { type: 'close'; sessionId: string }
  | { type: 'rename'; sessionId: string; title: string };

// Server → Client on control channel
export type ServerControlMessage =
  | { type: 'sessions'; sessions: SessionInfo[] }
  | { type: 'session-created'; session: SessionInfo }
  | { type: 'session-closed'; sessionId: string; exitCode: number | null }
  | { type: 'session-renamed'; sessionId: string; title: string; renamed: boolean }
  | { type: 'settings-changed'; settings: Settings }
  | { type: 'error'; error: string };

// Client → Server on I/O channel (text frames only — binary frames are raw terminal input)
export type ClientIOMessage =
  | { type: 'resize'; cols: number; rows: number };

// Runtime type guards for validating parsed WebSocket messages
export function isClientControlMessage(msg: unknown): msg is ClientControlMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return typeof m.type === 'string' && ['create', 'close', 'rename'].includes(m.type);
}

export function isClientIOMessage(msg: unknown): msg is ClientIOMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return typeof m.type === 'string' && m.type === 'resize';
}
