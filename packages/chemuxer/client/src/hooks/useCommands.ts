import type { Pane, DropZone } from '../types/layout.js';
import { THEMES, type Settings, type ThemeName, type ContainerInfo } from '@chemuxer/shared';

export interface Command {
  id: string;
  label: string;
  disabled?: boolean;
  action?: () => void;
  children?: Command[];
}

export interface CommandDeps {
  panes: Record<string, Pane>;
  focusedPaneId: string | null;
  zoomedPaneId: string | null;
  createSession: (container?: string) => void;
  closeSession: (id: string) => void;
  openSettings: () => void;
  toggleZoom: () => void;
  createSplitSession: (targetPaneId: string, zone: DropZone) => void;
  containers: ContainerInfo[];
}

interface CommandOptions {
  onRenameRequest?: (sessionId: string) => void;
}

export function useCommands(
  deps: CommandDeps,
  settings: Settings,
  updateSettings: (settings: Settings) => Promise<void>,
  options?: CommandOptions,
): Command[] {
  const { panes, focusedPaneId, zoomedPaneId, createSession, closeSession, openSettings } = deps;

  const focusedPane = focusedPaneId ? panes[focusedPaneId] : null;
  const activeEntry = focusedPane?.activeEntryIndex !== null && focusedPane?.activeEntryIndex !== undefined
    ? focusedPane.entries[focusedPane.activeEntryIndex]
    : null;
  const activeSessionId = activeEntry?.type === 'terminal' ? activeEntry.sessionId : null;

  const zoomed = !!zoomedPaneId;

  return [
    {
      id: 'new-terminal',
      label: 'New Terminal',
      disabled: zoomed,
      ...(deps.containers.length > 1
        ? {
            children: deps.containers.map(c => ({
              id: `new-terminal-${c.name}`,
              label: `${c.name}${c.isDefault ? ' (default)' : ''}`,
              disabled: c.state !== 'running',
              action: () => createSession(c.name),
            })),
          }
        : { action: () => createSession() }
      ),
    },
    {
      id: 'rename-terminal',
      label: 'Rename Terminal',
      disabled: zoomed || !activeSessionId,
      action: () => {
        if (activeSessionId) options?.onRenameRequest?.(activeSessionId);
      },
    },
    ...(Object.keys(panes).length > 1 ? [{
      id: 'toggle-zoom',
      label: 'Toggle Zoom Pane',
      action: () => deps.toggleZoom(),
    }] : []),
    {
      id: 'close-terminal',
      label: 'Close Terminal',
      disabled: zoomed || !activeSessionId,
      action: () => {
        if (activeSessionId) closeSession(activeSessionId);
      },
    },
    {
      id: 'open-settings',
      label: 'Open Settings',
      disabled: zoomed,
      action: () => openSettings(),
    },
    {
      id: 'select-theme',
      label: 'Select Color Theme',
      children: (Object.keys(THEMES) as ThemeName[]).map((name) => ({
        id: `theme-${name}`,
        label: name,
        action: () => {
          updateSettings({ ...settings, terminal: { ...settings.terminal, theme: name } }).catch(console.warn);
        },
      })),
    },
    {
      id: 'split-right',
      label: 'Split Right',
      disabled: zoomed,
      action: () => { if (focusedPaneId) deps.createSplitSession(focusedPaneId, 'right'); },
    },
    {
      id: 'split-left',
      label: 'Split Left',
      disabled: zoomed,
      action: () => { if (focusedPaneId) deps.createSplitSession(focusedPaneId, 'left'); },
    },
    {
      id: 'split-down',
      label: 'Split Down',
      disabled: zoomed,
      action: () => { if (focusedPaneId) deps.createSplitSession(focusedPaneId, 'bottom'); },
    },
    {
      id: 'split-up',
      label: 'Split Up',
      disabled: zoomed,
      action: () => { if (focusedPaneId) deps.createSplitSession(focusedPaneId, 'top'); },
    },
  ];
}
