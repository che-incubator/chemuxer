import { Group, Panel, Separator } from 'react-resizable-panels';
import { PaneNode } from './PaneNode.js';
import type { LayoutNode, Pane, DropZone } from '../types/layout.js';
import type { SessionInfo } from '@chemuxer/shared';
import type { Settings } from '@chemuxer/shared';

const FULL_SIZE_STYLE: React.CSSProperties = { height: '100%', width: '100%' };

interface LayoutRendererProps {
  node: LayoutNode;
  panes: Record<string, Pane>;
  sessions: SessionInfo[];
  wsUrl: string;
  settings: Settings;
  zoomedPaneId?: string | null;
  onSelectSession: (paneId: string, sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onCreateSession: () => void;
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
}

export function LayoutRenderer({
  node,
  panes,
  sessions,
  wsUrl,
  settings,
  zoomedPaneId,
  onSelectSession,
  onCloseSession,
  onCreateSession,
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
}: LayoutRendererProps) {
  const sharedProps = { panes, sessions, wsUrl, settings, zoomedPaneId, onSelectSession, onCloseSession, onCreateSession, onSplit, onMoveTab, onFocus, onSaveSettings, onSelectSettings, onMoveSettings, onSplitSettings, onCloseSettings, onRenameRequest, onRenameConfirm, onRenameCancel, renamingSessionId, onContextSplit, zoomed: !!zoomedPaneId };

  if (zoomedPaneId) {
    const pane = panes[zoomedPaneId];
    if (!pane) return null;
    return (
      <PaneNode
        pane={pane}
        sessions={sessions}
        wsUrl={wsUrl}
        settings={settings}
        onSelectSession={onSelectSession}
        onCloseSession={onCloseSession}
        onCreateSession={onCreateSession}
        onSplit={onSplit}
        onMoveTab={onMoveTab}
        onFocus={onFocus}
        onSaveSettings={onSaveSettings}
        onSelectSettings={onSelectSettings}
        onMoveSettings={onMoveSettings}
        onSplitSettings={onSplitSettings}
        onCloseSettings={onCloseSettings}
        onRenameRequest={onRenameRequest}
        onRenameConfirm={onRenameConfirm}
        onRenameCancel={onRenameCancel}
        renamingSessionId={renamingSessionId}
        onContextSplit={onContextSplit}
        zoomed={!!zoomedPaneId}
      />
    );
  }

  if (node.type === 'leaf') {
    const pane = panes[node.paneId];
    if (!pane) return null;
    return (
      <PaneNode
        pane={pane}
        sessions={sessions}
        wsUrl={wsUrl}
        settings={settings}
        onSelectSession={onSelectSession}
        onCloseSession={onCloseSession}
        onCreateSession={onCreateSession}
        onSplit={onSplit}
        onMoveTab={onMoveTab}
        onFocus={onFocus}
        onSaveSettings={onSaveSettings}
        onSelectSettings={onSelectSettings}
        onMoveSettings={onMoveSettings}
        onSplitSettings={onSplitSettings}
        onCloseSettings={onCloseSettings}
        onRenameRequest={onRenameRequest}
        onRenameConfirm={onRenameConfirm}
        onRenameCancel={onRenameCancel}
        renamingSessionId={renamingSessionId}
        onContextSplit={onContextSplit}
      />
    );
  }

  // Tree direction → react-resizable-panels orientation:
  // 'vertical' (side by side, vertical divider) → orientation="horizontal" (left-to-right)
  // 'horizontal' (stacked, horizontal divider) → orientation="vertical" (top-to-bottom)
  const orientation = node.direction === 'vertical' ? 'horizontal' : 'vertical';

  // Unique key based on child pane IDs forces remount when tree structure changes,
  // ensuring defaultSize is applied correctly
  const groupKey = getLeafIds(node).join('-');

  const firstLeafIds = getLeafIds(node.first);
  const secondLeafIds = getLeafIds(node.second);
  const firstPanelId = `panel-${firstLeafIds.join('+')}`;
  const secondPanelId = `panel-${secondLeafIds.join('+')}`;

  return (
    <Group key={groupKey} id={groupKey} orientation={orientation} style={FULL_SIZE_STYLE}>
      <Panel id={firstPanelId} defaultSize={node.ratio * 100} minSize={15}>
        <LayoutRenderer node={node.first} {...sharedProps} />
      </Panel>
      <Separator />
      <Panel id={secondPanelId} defaultSize={(1 - node.ratio) * 100} minSize={15}>
        <LayoutRenderer node={node.second} {...sharedProps} />
      </Panel>
    </Group>
  );
}

function getLeafIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.paneId];
  return [...getLeafIds(node.first), ...getLeafIds(node.second)];
}
