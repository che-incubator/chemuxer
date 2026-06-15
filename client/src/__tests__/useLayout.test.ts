import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLayout, resetPaneIdCounter } from '../hooks/useLayout.js';
import type { LayoutDeps } from '../hooks/useLayout.js';
import type { SessionInfo } from '../../../shared/protocol.js';

describe('useLayout', () => {
  beforeEach(() => {
    resetPaneIdCounter();
    localStorage.clear();
  });

  function makeDeps(sessions: SessionInfo[] = []): LayoutDeps {
    return {
      sessions,
      createSession: vi.fn(),
      closeSession: vi.fn(),
      renameSession: vi.fn(),
    };
  }

  it('hook initializes without error', () => {
    const { result } = renderHook(() => useLayout(makeDeps()));
    expect(result.current).toBeDefined();
    expect(result.current?.tree).toBeDefined();
  });

  it('hook initializes without error (async wrapper)', async () => {
    const { result } = renderHook(() => useLayout(makeDeps()));
    expect(result.current).toBeDefined();
    expect(result.current?.tree).toBeDefined();
  });

  function getSessionIds(pane: any): string[] {
    return (pane.entries || []).filter((e: any) => e.type === 'terminal').map((e: any) => e.sessionId);
  }

  function getActiveSessionId(pane: any): string {
    return pane.activeEntry?.type === 'terminal' ? pane.activeEntry.sessionId : '';
  }

  async function setupWithSessions(sessions: SessionInfo[]) {
    const deps = makeDeps(sessions);
    const { result, rerender } = renderHook(
      ({ deps }) => useLayout(deps),
      { initialProps: { deps } },
    );

    // Wait for the effect to update panes with the new sessions
    await waitFor(() => {
      if (!result.current) throw new Error('Hook not initialized');
      const firstPane = Object.values(result.current.panes)[0];
      if (!firstPane || getSessionIds(firstPane).length !== sessions.length) {
        throw new Error('Panes not updated yet');
      }
    });

    return { result, deps, rerender };
  }

  it('initializes with single leaf pane containing all sessions', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    if (!result.current) {
      throw new Error('Hook failed to render - result.current is undefined. Check console for errors.');
    }

    expect(result.current.tree.type).toBe('leaf');
    const paneId = (result.current.tree as any).paneId;
    const pane = result.current.panes[paneId];
    expect(getSessionIds(pane)).toEqual(['a', 'b']);
    expect(getActiveSessionId(pane)).toBe('a');
  });

  it('splitPane replaces leaf with split node', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.splitPane(paneId, 'b', 'right');
    });

    const tree = result.current.tree;
    expect(tree.type).toBe('split');
    if (tree.type === 'split') {
      expect(tree.direction).toBe('vertical');
      expect(tree.ratio).toBe(0.5);
      expect(tree.first.type).toBe('leaf');
      expect(tree.second.type).toBe('leaf');

      const firstPane = result.current.panes[(tree.first as any).paneId];
      const secondPane = result.current.panes[(tree.second as any).paneId];
      expect(getSessionIds(firstPane)).toEqual(['a']);
      expect(getSessionIds(secondPane)).toEqual(['b']);
    }
  });

  it('splitPane: left puts new pane first, direction vertical', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.splitPane(paneId, 'b', 'left');
    });

    const tree = result.current.tree;
    if (tree.type === 'split') {
      expect(tree.direction).toBe('vertical');
      const firstPane = result.current.panes[(tree.first as any).paneId];
      expect(getSessionIds(firstPane)).toEqual(['b']);
    }
  });

  it('splitPane: top creates horizontal split', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.splitPane(paneId, 'b', 'top');
    });

    if (result.current.tree.type === 'split') {
      expect(result.current.tree.direction).toBe('horizontal');
    }
  });

  it('splitPane: only tab onto same pane edge is no-op', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.splitPane(paneId, 'a', 'right');
    });

    expect(result.current.tree.type).toBe('leaf');
  });

  it('moveTab moves session between panes', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.splitPane(paneId, 'b', 'right');
    });

    const firstPaneId = (result.current.tree as any).first.paneId;
    const secondPaneId = (result.current.tree as any).second.paneId;

    act(() => {
      result.current.moveTab('a', firstPaneId, secondPaneId);
    });

    expect(result.current.tree.type).toBe('leaf');
    const remaining = result.current.panes[(result.current.tree as any).paneId];
    expect(getSessionIds(remaining)).toContain('a');
    expect(getSessionIds(remaining)).toContain('b');
  });

  it('moveTab to same pane is no-op', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.moveTab('a', paneId, paneId);
    });

    expect(getSessionIds(result.current.panes[paneId])).toEqual(['a', 'b']);
  });

  it('collapse: session closed removes pane and unwraps split', async () => {
    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ];
    const { result, rerender, deps } = await setupWithSessions(sessions);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.splitPane(paneId, 'b', 'right');
    });

    // Simulate session 'b' being closed by re-rendering with updated sessions
    act(() => {
      rerender({ deps: { ...deps, sessions: [sessions[0]] } });
    });

    expect(result.current.tree.type).toBe('leaf');
  });

  it('setActiveSession updates correct pane', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.setActiveSession(paneId, 'b');
    });

    expect(getActiveSessionId(result.current.panes[paneId])).toBe('b');
  });

  it('new session created via server goes into focused pane', async () => {
    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
    ];
    const { result, rerender, deps } = await setupWithSessions(sessions);

    // Simulate a new session arriving
    act(() => {
      rerender({
        deps: {
          ...deps,
          sessions: [
            ...sessions,
            { id: 'c', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 3000 },
          ],
        },
      });
    });

    const paneId = (result.current.tree as any).paneId;
    expect(getSessionIds(result.current.panes[paneId])).toContain('c');
  });

  it('closing a terminal tab preserves settings tab position in entries', async () => {
    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
      { id: 'c', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 3000 },
    ];
    const { result, rerender, deps } = await setupWithSessions(sessions);

    const paneId = (result.current.tree as any).paneId;

    // Open settings — it should appear at the end
    act(() => {
      result.current.openSettings();
    });

    const entriesBefore = result.current.panes[paneId].entries;
    // Entries should be: [terminal-a, terminal-b, terminal-c, settings]
    expect(entriesBefore[0].type).toBe('terminal');
    expect(entriesBefore[entriesBefore.length - 1].type).toBe('settings');

    // Close session 'a' (the first terminal tab) by re-rendering without it
    act(() => {
      rerender({ deps: { ...deps, sessions: sessions.slice(1) } });
    });

    const entriesAfter = result.current.panes[paneId].entries;
    // Settings should still be at the end, not jump to the front
    // Entries should be: [terminal-b, terminal-c, settings]
    expect(entriesAfter[0].type).toBe('terminal');
    expect(entriesAfter[entriesAfter.length - 1].type).toBe('settings');
  });

  it('moveSettings moves settings tab from one pane to another', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    // Split to create two panes
    act(() => {
      result.current.splitPane(paneId, 'b', 'right');
    });

    const firstPaneId = (result.current.tree as any).first.paneId;
    const secondPaneId = (result.current.tree as any).second.paneId;

    // Focus the first pane, then open settings there
    act(() => {
      result.current.setFocusedPane(firstPaneId);
    });
    act(() => {
      result.current.openSettings();
    });

    // Find which pane has settings
    const paneWithSettings = Object.entries(result.current.panes).find(
      ([, p]) => p.entries.some(e => e.type === 'settings')
    );
    expect(paneWithSettings).toBeTruthy();
    const settingsPaneId = paneWithSettings![0];
    const otherPaneId = settingsPaneId === firstPaneId ? secondPaneId : firstPaneId;

    // Move settings to the other pane
    act(() => {
      result.current.moveSettings(settingsPaneId, otherPaneId);
    });

    // Settings should now be in the other pane
    expect(result.current.panes[settingsPaneId]?.entries.some(e => e.type === 'settings')).toBeFalsy();
    expect(result.current.panes[otherPaneId].entries.some(e => e.type === 'settings')).toBe(true);
  });

  it('splitSettings creates a new pane with the settings tab via edge drop', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    // Open settings
    act(() => {
      result.current.openSettings();
    });

    // Verify single pane with settings + 2 terminals
    expect(result.current.tree.type).toBe('leaf');
    expect(result.current.panes[paneId].entries.some(e => e.type === 'settings')).toBe(true);

    // Split settings to the right
    act(() => {
      result.current.splitSettings(paneId, paneId, 'right');
    });

    // Should now have a split with settings in the new (right) pane
    expect(result.current.tree.type).toBe('split');
    if (result.current.tree.type === 'split') {
      const firstPaneId = (result.current.tree.first as any).paneId;
      const secondPaneId = (result.current.tree.second as any).paneId;

      // Original pane should NOT have settings
      expect(result.current.panes[firstPaneId].entries.some(e => e.type === 'settings')).toBe(false);
      // New pane should have settings
      expect(result.current.panes[secondPaneId].entries.some(e => e.type === 'settings')).toBe(true);
    }
  });

  it('createSplitSession creates a split and new session lands in new pane', async () => {
    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
    ];
    const { result, rerender, deps } = await setupWithSessions(sessions);

    const paneId = (result.current.tree as any).paneId;

    // Split right — creates empty pane and requests new session
    act(() => {
      result.current.createSplitSession(paneId, 'right');
    });

    // Tree should be split
    expect(result.current.tree.type).toBe('split');
    const secondPaneId = (result.current.tree as any).second.paneId;

    // New pane exists but is empty (waiting for session)
    expect(result.current.panes[secondPaneId].entries).toHaveLength(0);

    // createSession should have been called
    expect(deps.createSession).toHaveBeenCalled();

    // Simulate server creating the session by re-rendering with updated sessions
    act(() => {
      rerender({
        deps: {
          ...deps,
          sessions: [
            ...sessions,
            { id: 'b', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 2000 },
          ],
        },
      });
    });

    // New session should land in the new (focused) pane
    const newPane = result.current.panes[secondPaneId];
    expect(newPane.entries.some(e => e.type === 'terminal' && e.sessionId === 'b')).toBe(true);
  });

  it('createSplitSession allows multiple nested splits', async () => {
    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
    ];
    const { result, rerender, deps } = await setupWithSessions(sessions);

    const paneId = (result.current.tree as any).paneId;

    // First split right
    act(() => {
      result.current.createSplitSession(paneId, 'right');
    });

    const sessionsAfterFirst = [
      ...sessions,
      { id: 'b', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 2000 },
    ];
    act(() => {
      rerender({ deps: { ...deps, sessions: sessionsAfterFirst } });
    });

    const secondPaneId = (result.current.tree as any).second.paneId;

    // Second split down from the new pane
    act(() => {
      result.current.createSplitSession(secondPaneId, 'bottom');
    });

    act(() => {
      rerender({
        deps: {
          ...deps,
          sessions: [
            ...sessionsAfterFirst,
            { id: 'c', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 3000 },
          ],
        },
      });
    });

    // Should have 3 panes total
    expect(Object.keys(result.current.panes)).toHaveLength(3);
  });

  it('toggleZoom sets zoomedPaneId to focusedPaneId', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.splitPane(paneId, 'b', 'right');
    });

    const currentFocusedPaneId = result.current.focusedPaneId;

    act(() => {
      result.current.toggleZoom();
    });

    expect(result.current.zoomedPaneId).toBe(currentFocusedPaneId);
  });

  it('toggleZoom clears zoomedPaneId when already zoomed', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ]);

    const paneId = (result.current.tree as any).paneId;

    act(() => {
      result.current.splitPane(paneId, 'b', 'right');
    });

    act(() => {
      result.current.toggleZoom();
    });

    act(() => {
      result.current.toggleZoom();
    });

    expect(result.current.zoomedPaneId).toBeNull();
  });

  it('toggleZoom is no-op when only one pane exists', async () => {
    const { result } = await setupWithSessions([
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
    ]);

    act(() => {
      result.current.toggleZoom();
    });

    expect(result.current.zoomedPaneId).toBeNull();
  });

  it('saves layout to localStorage on change', async () => {
    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
    ];
    const { result } = await setupWithSessions(sessions);

    const saved = localStorage.getItem('chemuxer-layout:v1');
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed.tree).toBeDefined();
    expect(parsed.panes).toBeDefined();
    expect(parsed.focusedPaneId).toBeDefined();
  });

  it('excludes settings entries from saved layout', async () => {
    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
    ];
    const { result } = await setupWithSessions(sessions);

    act(() => { result.current.openSettings(); });

    const saved = JSON.parse(localStorage.getItem('chemuxer-layout:v1')!);
    const allEntries = Object.values(saved.panes).flatMap((p: any) => p.entries);
    expect(allEntries.every((e: any) => e.type === 'terminal')).toBe(true);
  });

  it('restores layout from localStorage when sessions match', async () => {
    const savedLayout = {
      tree: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { type: 'leaf', paneId: 'pane-10' },
        second: { type: 'leaf', paneId: 'pane-11' },
      },
      panes: {
        'pane-10': { entries: [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }], activeEntryIndex: 0 },
        'pane-11': { entries: [{ type: 'terminal', sessionId: 'b', tabNumber: 2 }], activeEntryIndex: 0 },
      },
      focusedPaneId: 'pane-10',
    };
    localStorage.setItem('chemuxer-layout:v1', JSON.stringify(savedLayout));

    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ];
    const deps = makeDeps(sessions);
    const { result } = renderHook(() => useLayout(deps));

    await waitFor(() => {
      expect(result.current.tree.type).toBe('split');
    });

    expect(Object.keys(result.current.panes)).toHaveLength(2);
    expect(result.current.panes['pane-10']).toBeDefined();
    expect(result.current.panes['pane-11']).toBeDefined();
    expect(result.current.focusedPaneId).toBe('pane-10');
  });

  it('discards saved layout when sessions do not match', async () => {
    const savedLayout = {
      tree: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { type: 'leaf', paneId: 'pane-10' },
        second: { type: 'leaf', paneId: 'pane-11' },
      },
      panes: {
        'pane-10': { entries: [{ type: 'terminal', sessionId: 'old-a', tabNumber: 1 }], activeEntryIndex: 0 },
        'pane-11': { entries: [{ type: 'terminal', sessionId: 'old-b', tabNumber: 2 }], activeEntryIndex: 0 },
      },
      focusedPaneId: 'pane-10',
    };
    localStorage.setItem('chemuxer-layout:v1', JSON.stringify(savedLayout));

    const sessions = [
      { id: 'new-x', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
    ];
    const deps = makeDeps(sessions);
    const { result } = renderHook(() => useLayout(deps));

    await waitFor(() => {
      const firstPane = Object.values(result.current.panes)[0];
      if (!firstPane || getSessionIds(firstPane).length !== 1) {
        throw new Error('Panes not updated yet');
      }
    });

    expect(result.current.tree.type).toBe('leaf');
    expect(Object.keys(result.current.panes)).toHaveLength(1);
  });

  it('restores layout and new server sessions go to focused pane', async () => {
    const savedLayout = {
      tree: { type: 'leaf', paneId: 'pane-10' },
      panes: {
        'pane-10': { entries: [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }], activeEntryIndex: 0 },
      },
      focusedPaneId: 'pane-10',
    };
    localStorage.setItem('chemuxer-layout:v1', JSON.stringify(savedLayout));

    const sessions = [
      { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
      { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ];
    const deps = makeDeps(sessions);
    const { result } = renderHook(() => useLayout(deps));

    await waitFor(() => {
      expect(result.current.panes['pane-10']).toBeDefined();
      const sessionIds = result.current.panes['pane-10'].entries
        .filter((e: any) => e.type === 'terminal')
        .map((e: any) => e.sessionId);
      if (!sessionIds.includes('b')) throw new Error('Session b not added yet');
    });

    const sessionIds = result.current.panes['pane-10'].entries
      .filter((e: any) => e.type === 'terminal')
      .map((e: any) => e.sessionId);
    expect(sessionIds).toContain('a');
    expect(sessionIds).toContain('b');
  });
});
