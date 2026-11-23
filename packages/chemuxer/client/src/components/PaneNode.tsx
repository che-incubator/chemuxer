import { useState, useCallback, useRef } from 'react';
import { PaneTabBar } from './PaneTabBar.js';
import { Terminal } from './Terminal.js';
import { SettingsEditor } from './SettingsEditor.js';
import { DropIndicator } from './DropIndicator.js';
import { useDrag } from '../contexts/DragContext.js';
import type { Pane, DropZone, DragData } from '../types/layout.js';
import type { SessionInfo } from '@chemuxer/shared';
import type { Settings } from '@chemuxer/shared';

function computeDropZone(e: React.DragEvent, element: HTMLElement): DropZone {
  const rect = element.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  if (x < 0.1) return 'left';
  if (x > 0.9) return 'right';
  if (y < 0.1) return 'top';
  if (y > 0.9) return 'bottom';
  return 'center';
}

interface PaneNodeProps {
  pane: Pane;
  sessions: SessionInfo[];
  wsUrl: string;
  settings: Settings;
  onSelectSession: (paneId: string, sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onPinSession: (sessionId: string, pinned: boolean) => void;
  onSplit: (targetPaneId: string, sessionId: string, zone: DropZone) => void;
  onMoveTab: (sessionId: string, sourcePaneId: string, targetPaneId: string) => void;
  onFocus: (paneId: string) => void;
  onSaveSettings: (settings: Settings) => Promise<void>;
  onSelectSettings: (paneId: string) => void;
  onMoveSettings: (sourcePaneId: string, targetPaneId: string) => void;
  onSplitSettings: (targetPaneId: string, sourcePaneId: string, zone: DropZone) => void;
  onCloseSettings: (paneId: string) => void;
  onRenameRequest?: (sessionId: string) => void;
  onRenameConfirm?: (sessionId: string, title: string) => void;
  onRenameCancel?: () => void;
  renamingSessionId?: string | null;
  onContextSplit?: (sessionId: string, zone: DropZone) => void;
  zoomed?: boolean;
  defaultContainer?: string;
}

export function PaneNode({
  pane,
  sessions,
  wsUrl,
  settings,
  onSelectSession,
  onCloseSession,
  onCreateSession,
  onPinSession,
  onSplit,
  onMoveTab,
  onFocus,
  onSaveSettings,
  onSelectSettings,
  onMoveSettings,
  onSplitSettings,
  onCloseSettings,
  onRenameRequest,
  onRenameConfirm,
  onRenameCancel,
  renamingSessionId,
  onContextSplit,
  zoomed,
  defaultContainer,
}: PaneNodeProps) {
  const { isDragging, startDrag, endDrag } = useDrag();
  const [hoveredZone, setHoveredZone] = useState<DropZone | null>(null);
  const terminalAreaRef = useRef<HTMLDivElement>(null);

  const handleFocus = useCallback(() => onFocus(pane.id), [onFocus, pane.id]);
  const handleSelect = useCallback((sessionId: string) => onSelectSession(pane.id, sessionId), [onSelectSession, pane.id]);
  const handleSelectSettings = useCallback(() => onSelectSettings(pane.id), [onSelectSettings, pane.id]);
  const handleCloseSettings = useCallback(() => onCloseSettings(pane.id), [onCloseSettings, pane.id]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!terminalAreaRef.current) return;
      if (!e.dataTransfer.types.includes('application/json')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setHoveredZone(computeDropZone(e, terminalAreaRef.current));
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setHoveredZone(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!terminalAreaRef.current) return;

      const zone = computeDropZone(e, terminalAreaRef.current);
      setHoveredZone(null);

      let data: DragData;
      try {
        data = JSON.parse(e.dataTransfer.getData('application/json'));
      } catch {
        return;
      }

      if (data.type === 'terminal') {
        if (zone === 'center') {
          onMoveTab(data.sessionId, data.sourcePaneId, pane.id);
        } else {
          onSplit(pane.id, data.sessionId, zone);
        }
      } else if (data.type === 'settings') {
        if (zone === 'center') {
          onMoveSettings(data.sourcePaneId, pane.id);
        } else {
          onSplitSettings(pane.id, data.sourcePaneId, zone);
        }
      }
    },
    [pane.id, onSplit, onMoveTab, onMoveSettings, onSplitSettings]
  );

  return (
    <div className="pane-node" onClick={handleFocus}>
      <PaneTabBar
        paneId={pane.id}
        entries={pane.entries}
        activeEntryIndex={pane.activeEntryIndex}
        sessions={sessions}
        onSelect={handleSelect}
        onClose={onCloseSession}
        onCreate={onCreateSession}
        onSelectSettings={handleSelectSettings}
        onCloseSettings={handleCloseSettings}
        onDragStart={startDrag}
        onDragEnd={endDrag}
        onRename={onRenameRequest}
        onPin={onPinSession}
        onSplit={onContextSplit}
        renamingSessionId={renamingSessionId}
        onRenameConfirm={onRenameConfirm}
        onRenameCancel={onRenameCancel}
        zoomed={zoomed}
        defaultContainer={defaultContainer}
      />
      <div
        ref={terminalAreaRef}
        className="pane-terminal-area"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {pane.entries.map((entry, index) => {
          if (entry.type === 'terminal') {
            return (
              <Terminal
                key={`terminal-${entry.sessionId}`}
                sessionId={entry.sessionId}
                wsUrl={wsUrl}
                settings={settings}
                visible={index === pane.activeEntryIndex}
              />
            );
          } else {
            return (
              <SettingsEditor
                key="settings"
                settings={settings}
                onSave={onSaveSettings}
                visible={index === pane.activeEntryIndex}
              />
            );
          }
        })}
        {hoveredZone ? <DropIndicator zone={hoveredZone} /> : null}
      </div>
    </div>
  );
}
