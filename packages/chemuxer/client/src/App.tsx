import { useState, useEffect, useCallback } from 'react';
import { resolveTheme } from '@chemuxer/shared';
import { useControl } from './hooks/useControl.js';
import { useLayout } from './hooks/useLayout.js';
import { useSettings } from './hooks/useSettings.js';
import { useCommands } from './hooks/useCommands.js';
import { useDevfileCommands } from './hooks/useDevfileCommands.js';
import { useContainers } from './hooks/useContainers.js';
import { LayoutRenderer } from './components/LayoutRenderer.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ConnectionBanner } from './components/ConnectionBanner.js';
import { PinConfirmModal } from './components/PinConfirmModal.js';
import { DragProvider } from './contexts/DragContext.js';
import { basePath } from './utils/basePath.js';
import type { DropZone } from './types/layout.js';
import './App.css';

const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${basePath()}/ws`;

export function App() {
  const { settings, updateSettings, applySettingsChanged } = useSettings();
  const control = useControl(`${WS_BASE}/control`, { onSettingsChanged: applySettingsChanged });
  const layout = useLayout({
    sessions: control.sessions,
    createSession: control.createSession,
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<{ sessionId: string; title: string } | null>(null);

  const { commands: devfileCommands, revalidateIfStale } = useDevfileCommands();
  const { containers, revalidateIfStale: revalidateContainers } = useContainers();

  const handleRenameRequest = useCallback((sessionId: string) => {
    setRenamingSessionId(sessionId);
  }, []);

  const handleCloseSession = useCallback((sessionId: string) => {
    const session = control.sessions.find((s) => s.id === sessionId);
    if (session?.pinned) {
      setPendingClose({ sessionId, title: session.title });
    } else {
      control.closeSession(sessionId);
    }
  }, [control]);

  const commands = useCommands(
    {
      panes: layout.panes,
      focusedPaneId: layout.focusedPaneId,
      zoomedPaneId: layout.zoomedPaneId,
      createSession: control.createSession,
      closeSession: handleCloseSession,
      openSettings: layout.openSettings,
      toggleZoom: layout.toggleZoom,
      createSplitSession: layout.createSplitSession,
      containers,
    },
    settings,
    updateSettings,
    { onRenameRequest: handleRenameRequest },
  );

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

    if (open) {
      // Revalidate devfile commands and containers if cache is stale
      revalidateIfStale();
      revalidateContainers();
    }
  }, [revalidateIfStale, revalidateContainers]);

  const handleRenameConfirm = useCallback((sessionId: string, title: string) => {
    control.renameSession(sessionId, title);
    setRenamingSessionId(null);
  }, [control.renameSession]);

  const handleRenameCancel = useCallback(() => {
    setRenamingSessionId(null);
  }, []);

  const handleContextSplit = useCallback((sessionId: string, zone: DropZone) => {
    const focusedPaneId = layout.focusedPaneId;
    if (focusedPaneId) {
      layout.splitPane(focusedPaneId, sessionId, zone);
    }
  }, [layout.focusedPaneId, layout.splitPane]);

  const handleRunDevfileCommand = useCallback(async (commandId: string) => {
    try {
      const response = await fetch(`${basePath()}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devfileCommandId: commandId }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        console.error('Failed to run devfile command:', error);
        alert(`Failed to start command "${commandId}": ${error.error || response.statusText}`);
        return;
      }
    } catch (err) {
      console.error('Failed to run devfile command:', err);
      alert(`Failed to start command "${commandId}": ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  const defaultContainer = containers.find(c => c.isDefault)?.name;

  return (
    <DragProvider>
      <div className="app">
        <ConnectionBanner connected={control.connected} retryIn={control.retryIn} />
        <div className="app-content">
          <LayoutRenderer
            node={layout.tree}
            panes={layout.panes}
            sessions={control.sessions}
            wsUrl={WS_BASE}
            settings={settings}
            zoomedPaneId={layout.zoomedPaneId}
            onSelectSession={layout.setActiveSession}
            onCloseSession={handleCloseSession}
            onCreateSession={control.createSession}
            onPinSession={control.pinSession}
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
            defaultContainer={defaultContainer}
          />
        </div>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={handlePaletteOpenChange}
          commands={commands}
          devfileCommands={devfileCommands}
          onRunDevfileCommand={handleRunDevfileCommand}
        />
        {pendingClose && (
          <PinConfirmModal
            sessionTitle={pendingClose.title}
            onConfirm={() => {
              control.closeSession(pendingClose.sessionId, true);
              setPendingClose(null);
            }}
            onCancel={() => setPendingClose(null)}
          />
        )}
      </div>
    </DragProvider>
  );
}
