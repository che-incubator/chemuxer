import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useControl } from './useControl.js';
import type { LayoutNode, Pane, DropZone, TabEntry } from '../types/layout.js';

const LAYOUT_STORAGE_KEY = 'chemuxer-layout:v1';

let nextPaneId = 0;
function generatePaneId(): string {
  return `pane-${nextPaneId++}`;
}

let nextTabNumber = 0;
function generateTabNumber(): number {
  return ++nextTabNumber;
}

// Export for testing
export function resetPaneIdCounter() {
  nextPaneId = 0;
  nextTabNumber = 0;
}

function dropZoneToDirection(zone: DropZone): 'horizontal' | 'vertical' {
  if (zone === 'left' || zone === 'right') return 'vertical';
  return 'horizontal';
}

function replaceLeaf(node: LayoutNode, targetPaneId: string, replacement: LayoutNode): LayoutNode {
  if (node.type === 'leaf') {
    return node.paneId === targetPaneId ? replacement : node;
  }
  return {
    ...node,
    first: replaceLeaf(node.first, targetPaneId, replacement),
    second: replaceLeaf(node.second, targetPaneId, replacement),
  };
}

function removeLeaf(node: LayoutNode, targetPaneId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.paneId === targetPaneId ? null : node;
  }
  const first = removeLeaf(node.first, targetPaneId);
  const second = removeLeaf(node.second, targetPaneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function getTerminalSessionIds(entries: TabEntry[]): string[] {
  return entries.filter((e): e is { type: 'terminal'; sessionId: string; tabNumber: number } => e.type === 'terminal').map(e => e.sessionId);
}

function tabEntryEquals(a: TabEntry | null, b: TabEntry | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === 'terminal' && b.type === 'terminal') return a.sessionId === b.sessionId;
  return true; // both settings
}

export interface LayoutState {
  tree: LayoutNode;
  panes: Record<string, Pane>;
  sessions: import('../../../shared/protocol.js').SessionInfo[];
  focusedPaneId: string | null;
  zoomedPaneId: string | null;
  connected: boolean;
  retryIn: number | null;
  splitPane: (targetPaneId: string, sessionId: string, zone: DropZone) => void;
  moveTab: (sessionId: string, sourcePaneId: string, targetPaneId: string) => void;
  setActiveSession: (paneId: string, sessionId: string) => void;
  setFocusedPane: (paneId: string) => void;
  createSession: () => void;
  closeSession: (sessionId: string) => void;
  openSettings: () => void;
  selectSettings: (paneId: string) => void;
  moveSettings: (sourcePaneId: string, targetPaneId: string) => void;
  splitSettings: (targetPaneId: string, sourcePaneId: string, zone: DropZone) => void;
  closeSettings: (paneId: string) => void;
  createSplitSession: (targetPaneId: string, zone: DropZone) => void;
  renameSession: (sessionId: string, title: string) => void;
  toggleZoom: () => void;
}

interface LayoutOptions {
  onSettingsChanged?: (settings: import('../../../shared/settings.js').Settings) => void;
}

export function useLayout(controlUrl: string, options?: LayoutOptions): LayoutState {
  const control = useControl(controlUrl, { onSettingsChanged: options?.onSettingsChanged });

  const initialPaneId = useMemo(() => generatePaneId(), []);

  const [tree, setTree] = useState<LayoutNode>(() => ({ type: 'leaf', paneId: initialPaneId }));
  const [panes, setPanes] = useState<Record<string, Pane>>(() => ({
    [initialPaneId]: { id: initialPaneId, entries: [], activeEntry: null },
  }));
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(initialPaneId);
  const [zoomedPaneId, setZoomedPaneId] = useState<string | null>(null);
  const [pendingPaneIds, setPendingPaneIds] = useState<Set<string>>(new Set());
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!restoredRef.current && control.sessions.length > 0) {
      restoredRef.current = true;
      const savedRaw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (savedRaw) {
        try {
          const saved = JSON.parse(savedRaw);
          const savedSessionIds = new Set(
            Object.values(saved.panes as Record<string, { entries: TabEntry[] }>)
              .flatMap((p) => p.entries.filter((e) => e.type === 'terminal').map((e: any) => e.sessionId))
          );
          const serverSessionIds = new Set(control.sessions.map((s) => s.id));
          const allMatch = [...savedSessionIds].every((id) => serverSessionIds.has(id));

          if (allMatch && savedSessionIds.size > 0) {
            const restoredPanes: Record<string, Pane> = {};
            let maxPaneNum = 0;
            let maxTabNum = 0;
            for (const [id, savedPane] of Object.entries(saved.panes as Record<string, { entries: TabEntry[]; activeEntryIndex: number }>)) {
              const num = parseInt(id.replace('pane-', ''), 10);
              if (!isNaN(num) && num >= maxPaneNum) maxPaneNum = num + 1;
              for (const e of savedPane.entries) {
                if (e.type === 'terminal' && e.tabNumber >= maxTabNum) maxTabNum = e.tabNumber + 1;
              }
              restoredPanes[id] = {
                id,
                entries: savedPane.entries,
                activeEntry: savedPane.entries[savedPane.activeEntryIndex] ?? savedPane.entries[0] ?? null,
              };
            }
            nextPaneId = maxPaneNum;
            nextTabNumber = maxTabNum - 1;
            setTree(saved.tree);
            setPanes(restoredPanes);
            setFocusedPaneId(saved.focusedPaneId);
            return;
          }
        } catch {
          // Invalid JSON — fall through to normal behavior
        }
      }
    }

    setPanes((prev) => {
      const allPaneSessionIds = new Set(Object.values(prev).flatMap((p) => getTerminalSessionIds(p.entries)));
      const newSessionIds = control.sessions.map((s) => s.id).filter((id) => !allPaneSessionIds.has(id));
      const removedSessionIds = new Set(
        [...allPaneSessionIds].filter((id) => !control.sessions.some((s) => s.id === id))
      );

      if (newSessionIds.length === 0 && removedSessionIds.size === 0) return prev;

      const updated = { ...prev };

      if (newSessionIds.length > 0) {
        const targetId = focusedPaneId ?? Object.keys(updated)[0];
        if (targetId && updated[targetId]) {
          const pane = updated[targetId];
          const newEntries: TabEntry[] = newSessionIds.map((sessionId) => ({ type: 'terminal', sessionId, tabNumber: generateTabNumber() }));
          updated[targetId] = {
            ...pane,
            entries: [...pane.entries, ...newEntries],
            activeEntry: pane.activeEntry ?? newEntries[0],
          };
        }
      }

      if (removedSessionIds.size > 0) {
        for (const [id, pane] of Object.entries(updated)) {
          const newEntries = pane.entries.filter((e) =>
            e.type !== 'terminal' || !removedSessionIds.has(e.sessionId)
          );
          if (newEntries.length !== pane.entries.length) {
            updated[id] = {
              ...pane,
              entries: newEntries,
              activeEntry: pane.activeEntry && newEntries.some((e) => tabEntryEquals(e, pane.activeEntry))
                ? pane.activeEntry
                : newEntries[newEntries.length - 1] ?? null,
            };
          }
        }
      }

      return updated;
    });

    if (pendingPaneIds.size > 0) {
      setPendingPaneIds((prev) => {
        const next = new Set(prev);
        for (const id of prev) {
          if (panes[id] && panes[id].entries.length > 0) {
            next.delete(id);
          }
        }
        return next.size === prev.size ? prev : next;
      });
    }
  }, [control.sessions, focusedPaneId, pendingPaneIds, panes]);

  useEffect(() => {
    const emptyPaneIds = Object.entries(panes)
      .filter(([id, p]) => p.entries.length === 0 && !pendingPaneIds.has(id))
      .map(([id]) => id);

    if (emptyPaneIds.length === 0 || Object.keys(panes).length <= 1) return;

    for (const emptyId of emptyPaneIds) {
      setTree((prev) => removeLeaf(prev, emptyId) ?? prev);
      setPanes((prev) => {
        const { [emptyId]: _, ...rest } = prev;
        return rest;
      });
      if (focusedPaneId === emptyId) {
        const remaining = Object.keys(panes).filter((id) => id !== emptyId);
        setFocusedPaneId(remaining[0] ?? null);
      }
    }
  }, [panes, focusedPaneId, pendingPaneIds]);

  useEffect(() => {
    const savedPanes: Record<string, { entries: TabEntry[]; activeEntryIndex: number }> = {};
    for (const [id, pane] of Object.entries(panes)) {
      const terminalEntries = pane.entries.filter((e) => e.type === 'terminal');
      if (terminalEntries.length === 0) continue;
      const activeIndex = pane.activeEntry
        ? terminalEntries.findIndex((e) => tabEntryEquals(e, pane.activeEntry))
        : 0;
      savedPanes[id] = { entries: terminalEntries, activeEntryIndex: Math.max(0, activeIndex) };
    }
    if (Object.keys(savedPanes).length === 0) return;
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
      tree,
      panes: savedPanes,
      focusedPaneId,
    }));
  }, [tree, panes, focusedPaneId]);

  const splitPane = useCallback(
    (targetPaneId: string, sessionId: string, zone: DropZone) => {
      if (zone === 'center') return;

      setPanes((prev) => {
        const sourcePaneEntry = Object.entries(prev).find(([, p]) =>
          getTerminalSessionIds(p.entries).includes(sessionId)
        );
        if (!sourcePaneEntry) return prev;
        const [sourcePaneId, sourcePane] = sourcePaneEntry;

        if (sourcePaneId === targetPaneId && getTerminalSessionIds(sourcePane.entries).length === 1) return prev;

        const newPaneId = generatePaneId();
        const direction = dropZoneToDirection(zone);
        const isFirst = zone === 'left' || zone === 'top';

        const newLeaf: LayoutNode = { type: 'leaf', paneId: newPaneId };
        const originalLeaf: LayoutNode = { type: 'leaf', paneId: targetPaneId };
        const splitNode: LayoutNode = {
          type: 'split',
          direction,
          ratio: 0.5,
          first: isFirst ? newLeaf : originalLeaf,
          second: isFirst ? originalLeaf : newLeaf,
        };

        const updated = { ...prev };

        const sourceEntry = sourcePane.entries.find(
          (e) => e.type === 'terminal' && e.sessionId === sessionId
        ) as TabEntry;
        const filteredEntries = sourcePane.entries.filter((e) =>
          e.type !== 'terminal' || e.sessionId !== sessionId
        );
        updated[sourcePaneId] = {
          ...sourcePane,
          entries: filteredEntries,
          activeEntry: filteredEntries.some((e) => tabEntryEquals(e, sourcePane.activeEntry))
            ? sourcePane.activeEntry
            : filteredEntries[filteredEntries.length - 1] ?? null,
        };

        updated[newPaneId] = { id: newPaneId, entries: [sourceEntry], activeEntry: sourceEntry };

        setTree((prevTree) => replaceLeaf(prevTree, targetPaneId, splitNode));
        setFocusedPaneId(newPaneId);

        return updated;
      });
    },
    []
  );

  const moveTab = useCallback(
    (sessionId: string, sourcePaneId: string, targetPaneId: string) => {
      if (sourcePaneId === targetPaneId) return;

      setPanes((prev) => {
        const source = prev[sourcePaneId];
        const target = prev[targetPaneId];
        if (!source || !target) return prev;

        const updated = { ...prev };
        const movedEntry = source.entries.find(
          (e) => e.type === 'terminal' && e.sessionId === sessionId
        ) as TabEntry;
        const filteredEntries = source.entries.filter((e) =>
          e.type !== 'terminal' || e.sessionId !== sessionId
        );
        updated[sourcePaneId] = {
          ...source,
          entries: filteredEntries,
          activeEntry: filteredEntries.some((e) => tabEntryEquals(e, source.activeEntry))
            ? source.activeEntry
            : filteredEntries[filteredEntries.length - 1] ?? null,
        };
        updated[targetPaneId] = {
          ...target,
          entries: [...target.entries, movedEntry],
          activeEntry: movedEntry,
        };
        return updated;
      });
    },
    []
  );

  const setActiveSession = useCallback((paneId: string, sessionId: string) => {
    setPanes((prev) => {
      const pane = prev[paneId];
      if (!pane) return prev;
      const entry = pane.entries.find((e): e is { type: 'terminal'; sessionId: string } =>
        e.type === 'terminal' && e.sessionId === sessionId
      );
      if (!entry) return prev;
      return { ...prev, [paneId]: { ...pane, activeEntry: entry } };
    });
  }, []);

  const openSettings = useCallback(() => {
    setPanes((prev) => {
      const settingsEntry: TabEntry = { type: 'settings' };

      // Check if any pane already has settings open
      for (const [paneId, pane] of Object.entries(prev)) {
        if (pane.entries.some((e) => e.type === 'settings')) {
          return { ...prev, [paneId]: { ...pane, activeEntry: settingsEntry } };
        }
      }

      // Otherwise, add settings to the focused pane (or first pane if no focus)
      const targetId = focusedPaneId ?? Object.keys(prev)[0];
      if (!targetId || !prev[targetId]) return prev;

      const pane = prev[targetId];
      return {
        ...prev,
        [targetId]: {
          ...pane,
          entries: [...pane.entries, settingsEntry],
          activeEntry: settingsEntry,
        },
      };
    });
  }, [focusedPaneId]);

  const selectSettings = useCallback((paneId: string) => {
    setPanes((prev) => {
      const pane = prev[paneId];
      if (!pane) return prev;
      const settingsEntry = pane.entries.find((e) => e.type === 'settings');
      if (!settingsEntry) return prev;
      return { ...prev, [paneId]: { ...pane, activeEntry: settingsEntry } };
    });
  }, []);

  const moveSettings = useCallback((sourcePaneId: string, targetPaneId: string) => {
    if (sourcePaneId === targetPaneId) return;
    setPanes((prev) => {
      const source = prev[sourcePaneId];
      const target = prev[targetPaneId];
      if (!source || !target) return prev;
      if (target.entries.some((e) => e.type === 'settings')) return prev;

      const settingsEntry: TabEntry = { type: 'settings' };
      const updated = { ...prev };
      updated[sourcePaneId] = {
        ...source,
        entries: source.entries.filter((e) => e.type !== 'settings'),
        activeEntry: source.activeEntry?.type === 'settings'
          ? source.entries.find((e) => e.type !== 'settings') ?? null
          : source.activeEntry,
      };
      updated[targetPaneId] = {
        ...target,
        entries: [...target.entries, settingsEntry],
        activeEntry: settingsEntry,
      };
      return updated;
    });
  }, []);

  const splitSettings = useCallback(
    (targetPaneId: string, sourcePaneId: string, zone: DropZone) => {
      if (zone === 'center') {
        moveSettings(sourcePaneId, targetPaneId);
        return;
      }

      const newPaneId = generatePaneId();
      const direction = dropZoneToDirection(zone);
      const isFirst = zone === 'left' || zone === 'top';

      const newLeaf: LayoutNode = { type: 'leaf', paneId: newPaneId };
      const originalLeaf: LayoutNode = { type: 'leaf', paneId: targetPaneId };
      const splitNode: LayoutNode = {
        type: 'split',
        direction,
        ratio: 0.5,
        first: isFirst ? newLeaf : originalLeaf,
        second: isFirst ? originalLeaf : newLeaf,
      };

      setPanes((prev) => {
        const source = prev[sourcePaneId];
        if (!source) return prev;

        const settingsEntry: TabEntry = { type: 'settings' };
        const updated = { ...prev };

        updated[sourcePaneId] = {
          ...source,
          entries: source.entries.filter((e) => e.type !== 'settings'),
          activeEntry: source.activeEntry?.type === 'settings'
            ? source.entries.find((e) => e.type !== 'settings') ?? null
            : source.activeEntry,
        };

        updated[newPaneId] = { id: newPaneId, entries: [settingsEntry], activeEntry: settingsEntry };

        return updated;
      });

      setTree((prev) => replaceLeaf(prev, targetPaneId, splitNode));
      setFocusedPaneId(newPaneId);
    },
    [moveSettings]
  );

  const closeSettings = useCallback((paneId: string) => {
    setPanes((prev) => {
      const pane = prev[paneId];
      if (!pane) return prev;

      const filteredEntries = pane.entries.filter((e) => e.type !== 'settings');
      return {
        ...prev,
        [paneId]: {
          ...pane,
          entries: filteredEntries,
          activeEntry: filteredEntries.some((e) => tabEntryEquals(e, pane.activeEntry))
            ? pane.activeEntry
            : filteredEntries[filteredEntries.length - 1] ?? null,
        },
      };
    });
  }, []);

  const createSplitSession = useCallback(
    (targetPaneId: string, zone: DropZone) => {
      const newPaneId = generatePaneId();
      const direction = dropZoneToDirection(zone);
      const isFirst = zone === 'left' || zone === 'top';

      const newLeaf: LayoutNode = { type: 'leaf', paneId: newPaneId };
      const originalLeaf: LayoutNode = { type: 'leaf', paneId: targetPaneId };
      const splitNode: LayoutNode = {
        type: 'split',
        direction,
        ratio: 0.5,
        first: isFirst ? newLeaf : originalLeaf,
        second: isFirst ? originalLeaf : newLeaf,
      };

      setPanes((prev) => ({
        ...prev,
        [newPaneId]: { id: newPaneId, entries: [], activeEntry: null },
      }));

      setPendingPaneIds((prev) => new Set([...prev, newPaneId]));
      setTree((prev) => replaceLeaf(prev, targetPaneId, splitNode));
      setFocusedPaneId(newPaneId);
      control.createSession();
    },
    [control]
  );

  const toggleZoom = useCallback(() => {
    if (Object.keys(panes).length <= 1) {
      return;
    }
    setZoomedPaneId((prev) => (prev === null ? focusedPaneId : null));
  }, [panes, focusedPaneId]);

  return {
    tree,
    panes,
    sessions: control.sessions,
    focusedPaneId,
    zoomedPaneId,
    connected: control.connected,
    retryIn: control.retryIn,
    splitPane,
    moveTab,
    setActiveSession,
    setFocusedPane: setFocusedPaneId,
    createSession: control.createSession,
    closeSession: control.closeSession,
    openSettings,
    selectSettings,
    moveSettings,
    splitSettings,
    closeSettings,
    createSplitSession,
    renameSession: control.renameSession,
    toggleZoom,
  };
}
