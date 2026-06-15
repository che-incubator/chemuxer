import type { LayoutState } from './useLayout.js';
import { THEMES, type Settings, type ThemeName } from '../../../shared/settings.js';

export interface Command {
  id: string;
  label: string;
  action?: () => void;
  children?: Command[];
}

interface CommandOptions {
  onRenameRequest?: (sessionId: string) => void;
}

export function useCommands(
  layout: LayoutState,
  settings: Settings,
  updateSettings: (settings: Settings) => Promise<void>,
  options?: CommandOptions,
): Command[] {
  const { panes, focusedPaneId, zoomedPaneId, createSession, closeSession, openSettings } = layout;

  const focusedPane = focusedPaneId ? panes[focusedPaneId] : null;
  const activeSessionId = focusedPane?.activeEntry?.type === 'terminal' ? focusedPane.activeEntry.sessionId : null;

  return [
    {
      id: 'new-terminal',
      label: 'New Terminal',
      action: () => {
        if (zoomedPaneId) return;
        createSession();
      },
    },
    {
      id: 'rename-terminal',
      label: 'Rename Terminal',
      action: () => {
        if (activeSessionId) {
          options?.onRenameRequest?.(activeSessionId);
        }
      },
    },
    ...(Object.keys(panes).length > 1 ? [{
      id: 'toggle-zoom',
      label: 'Toggle Zoom Pane',
      action: () => {
        layout.toggleZoom();
      },
    }] : []),
    {
      id: 'close-terminal',
      label: 'Close Terminal',
      action: () => {
        if (zoomedPaneId) return;
        if (activeSessionId) {
          closeSession(activeSessionId);
        }
      },
    },
    {
      id: 'open-settings',
      label: 'Open Settings',
      action: () => {
        if (zoomedPaneId) return;
        openSettings();
      },
    },
    {
      id: 'select-theme',
      label: 'Select Color Theme',
      children: (Object.keys(THEMES) as ThemeName[]).map((name) => ({
        id: `theme-${name}`,
        label: name,
        action: () => {
          updateSettings({ ...settings, terminal: { ...settings.terminal, theme: name } });
        },
      })),
    },
    {
      id: 'split-right',
      label: 'Split Right',
      action: () => {
        if (zoomedPaneId) return;
        if (focusedPaneId) {
          layout.createSplitSession(focusedPaneId, 'right');
        }
      },
    },
    {
      id: 'split-left',
      label: 'Split Left',
      action: () => {
        if (zoomedPaneId) return;
        if (focusedPaneId) {
          layout.createSplitSession(focusedPaneId, 'left');
        }
      },
    },
    {
      id: 'split-down',
      label: 'Split Down',
      action: () => {
        if (zoomedPaneId) return;
        if (focusedPaneId) {
          layout.createSplitSession(focusedPaneId, 'bottom');
        }
      },
    },
    {
      id: 'split-up',
      label: 'Split Up',
      action: () => {
        if (zoomedPaneId) return;
        if (focusedPaneId) {
          layout.createSplitSession(focusedPaneId, 'top');
        }
      },
    },
  ];
}
