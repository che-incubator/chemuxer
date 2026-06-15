import { useState, useRef, useEffect } from 'react';
import type { SessionInfo } from '../../../shared/protocol.js';
import type { DragData, DropZone, TabEntry } from '../types/layout.js';
import { TabContextMenu } from './TabContextMenu.js';

interface PaneTabBarProps {
  paneId: string;
  entries: TabEntry[];
  activeEntryIndex: number | null;
  sessions: SessionInfo[];
  onSelect: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCreate: () => void;
  onSelectSettings?: () => void;
  onCloseSettings?: () => void;
  onDragStart: (data: DragData) => void;
  onDragEnd: () => void;
  onRename?: (sessionId: string) => void;
  onSplit?: (sessionId: string, zone: DropZone) => void;
  renamingSessionId?: string | null;
  onRenameConfirm?: (sessionId: string, title: string) => void;
  onRenameCancel?: () => void;
  zoomed?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  sessionId: string | null;
  isSettings: boolean;
}

function InlineRenameInput({
  defaultValue,
  sessionId,
  onConfirm,
  onCancel,
}: {
  defaultValue: string;
  sessionId: string;
  onConfirm: (sessionId: string, title: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      className="tab-rename-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onConfirm(sessionId, value);
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
      onBlur={() => onCancel()}
      autoFocus
    />
  );
}

export function PaneTabBar({
  paneId,
  entries,
  activeEntryIndex,
  sessions,
  onSelect,
  onClose,
  onCreate,
  onSelectSettings,
  onCloseSettings,
  onDragStart,
  onDragEnd,
  onRename,
  onSplit,
  renamingSessionId,
  onRenameConfirm,
  onRenameCancel,
  zoomed,
}: PaneTabBarProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  return (
    <div className="tab-bar">
      {entries.map((entry, index) => {
        if (entry.type === 'terminal') {
          const session = sessions.find((s) => s.id === entry.sessionId);
          if (!session) return null;

          const isRenaming = renamingSessionId === entry.sessionId;

          return (
            <div
              key={`terminal-${entry.sessionId}`}
              data-tab
              draggable={!isRenaming}
              className={`tab ${index === activeEntryIndex ? 'tab-active' : ''}`}
              onClick={() => onSelect(entry.sessionId)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  sessionId: entry.sessionId,
                  isSettings: false,
                });
              }}
              onDragStart={(e) => {
                const data: DragData = { type: 'terminal', sessionId: entry.sessionId, sourcePaneId: paneId };
                e.dataTransfer.setData('application/json', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(data);
              }}
              onDragEnd={onDragEnd}
            >
              {isRenaming && onRenameConfirm && onRenameCancel ? (
                <InlineRenameInput
                  defaultValue={session.title}
                  sessionId={entry.sessionId}
                  onConfirm={onRenameConfirm}
                  onCancel={onRenameCancel}
                />
              ) : (
                <>
                  <span className="tab-title">{session.renamed ? session.title : `${session.title} — ${entry.tabNumber}`}</span>
                  {!zoomed && (
                    <span
                      className="tab-close"
                      title="Close tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(entry.sessionId);
                      }}
                    >
                      ×
                    </span>
                  )}
                </>
              )}
            </div>
          );
        } else {
          return (
            <div
              key="settings"
              data-tab
              draggable
              className={`tab ${index === activeEntryIndex ? 'tab-active' : ''}`}
              onClick={() => onSelectSettings?.()}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  sessionId: null,
                  isSettings: true,
                });
              }}
              onDragStart={(e) => {
                const data: DragData = { type: 'settings', sourcePaneId: paneId };
                e.dataTransfer.setData('application/json', JSON.stringify(data));
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(data);
              }}
              onDragEnd={onDragEnd}
            >
              <span className="tab-title">⚙ Settings</span>
              {!zoomed && (
                <span
                  className="tab-close"
                  title="Close settings"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseSettings?.();
                  }}
                >
                  ×
                </span>
              )}
            </div>
          );
        }
      })}
      {zoomed ? (
        <span className="zoom-badge">ZOOMED</span>
      ) : (
        <div className="tab-new" title="New tab" onClick={onCreate}>
          +
        </div>
      )}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sessionId={contextMenu.sessionId}
          paneId={paneId}
          isSettings={contextMenu.isSettings}
          zoomed={zoomed}
          onRename={() => {
            if (contextMenu.sessionId) {
              onRename?.(contextMenu.sessionId);
            }
            setContextMenu(null);
          }}
          onClose={() => {
            if (contextMenu.isSettings) {
              onCloseSettings?.();
            } else if (contextMenu.sessionId) {
              onClose(contextMenu.sessionId);
            }
            setContextMenu(null);
          }}
          onSplitRight={() => {
            if (contextMenu.sessionId) onSplit?.(contextMenu.sessionId, 'right');
            setContextMenu(null);
          }}
          onSplitLeft={() => {
            if (contextMenu.sessionId) onSplit?.(contextMenu.sessionId, 'left');
            setContextMenu(null);
          }}
          onSplitDown={() => {
            if (contextMenu.sessionId) onSplit?.(contextMenu.sessionId, 'bottom');
            setContextMenu(null);
          }}
          onSplitUp={() => {
            if (contextMenu.sessionId) onSplit?.(contextMenu.sessionId, 'top');
            setContextMenu(null);
          }}
          onDismiss={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
