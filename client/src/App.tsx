import { useState, useEffect, useCallback } from 'react';
import { resolveTheme } from '../../shared/settings.js';
import { useLayout } from './hooks/useLayout.js';
import { useSettings } from './hooks/useSettings.js';
import { useCommands } from './hooks/useCommands.js';
import { LayoutRenderer } from './components/LayoutRenderer.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ConnectionBanner } from './components/ConnectionBanner.js';
import { DragProvider } from './contexts/DragContext.js';
import type { DropZone } from './types/layout.js';
import './App.css';

const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export function App() {
  const { settings, updateSettings, applySettingsChanged } = useSettings();
  const layout = useLayout(`${WS_BASE}/control`, { onSettingsChanged: applySettingsChanged });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);

  const handleRenameRequest = useCallback((sessionId: string) => {
    setRenamingSessionId(sessionId);
  }, []);

  const commands = useCommands(layout, settings, updateSettings, { onRenameRequest: handleRenameRequest });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1' || (e.key.toLowerCase() === 'p' && e.shiftKey && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        e.stopPropagation();
        setPaletteOpen((prev) => !prev);
      }
      if (e.key.toLowerCase() === 'm' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        layout.toggleZoom();
      }
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [layout.toggleZoom]);

  useEffect(() => {
    const theme = resolveTheme(settings.terminal.theme);
    const root = document.documentElement;
    root.style.setProperty('--ch-base', theme.base);
    root.style.setProperty('--ch-mantle', theme.mantle);
    root.style.setProperty('--ch-crust', theme.crust);
    root.style.setProperty('--ch-surface0', theme.surface0);
    root.style.setProperty('--ch-overlay0', theme.overlay0);
    root.style.setProperty('--ch-text', theme.text);
    root.style.setProperty('--ch-subtext0', theme.subtext0);
    root.style.setProperty('--ch-blue', theme.blue);
    root.style.setProperty('--ch-red', theme.red);
  }, [settings.terminal.theme]);

  const handlePaletteOpenChange = useCallback((open: boolean) => {
    setPaletteOpen(open);
  }, []);

  const handleRenameConfirm = useCallback((sessionId: string, title: string) => {
    layout.renameSession(sessionId, title);
    setRenamingSessionId(null);
  }, [layout.renameSession]);

  const handleRenameCancel = useCallback(() => {
    setRenamingSessionId(null);
  }, []);

  const handleContextSplit = useCallback((sessionId: string, zone: DropZone) => {
    const focusedPaneId = layout.focusedPaneId;
    if (focusedPaneId) {
      layout.splitPane(focusedPaneId, sessionId, zone);
    }
  }, [layout.focusedPaneId, layout.splitPane]);

  return (
    <DragProvider>
      <div className="app">
        <ConnectionBanner connected={layout.connected} retryIn={layout.retryIn} />
        <div className="app-content">
          <LayoutRenderer
            node={layout.tree}
            panes={layout.panes}
            sessions={layout.sessions}
            wsUrl={WS_BASE}
            settings={settings}
            zoomedPaneId={layout.zoomedPaneId}
            onSelectSession={layout.setActiveSession}
            onCloseSession={layout.closeSession}
            onCreateSession={layout.createSession}
            onSplit={layout.splitPane}
            onMoveTab={layout.moveTab}
            onFocus={layout.setFocusedPane}
            onSaveSettings={updateSettings}
            onSelectSettings={layout.selectSettings}
            onMoveSettings={layout.moveSettings}
            onSplitSettings={layout.splitSettings}
            onCloseSettings={layout.closeSettings}
            onRenameRequest={handleRenameRequest}
            onRenameConfirm={handleRenameConfirm}
            onRenameCancel={handleRenameCancel}
            renamingSessionId={renamingSessionId}
            onContextSplit={handleContextSplit}
          />
        </div>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={handlePaletteOpenChange}
          commands={commands}
        />
      </div>
    </DragProvider>
  );
}
