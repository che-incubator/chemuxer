import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaneTabBar } from '../components/PaneTabBar.js';
import type { SessionInfo } from '../../../shared/protocol.js';
import type { TabEntry } from '../types/layout.js';

const sessions: SessionInfo[] = [
  { id: 'a', shell: '/bin/bash', title: 'bash', renamed: false, createdAt: 1000 },
  { id: 'b', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
];

describe('PaneTabBar', () => {
  it('renders tabs for sessions in the pane', () => {
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'terminal', sessionId: 'b', tabNumber: 2 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    expect(screen.getByText('bash — 1')).toBeTruthy();
    expect(screen.getByText('zsh — 2')).toBeTruthy();
  });

  it('click switches active session', () => {
    const onSelect = vi.fn();
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'terminal', sessionId: 'b', tabNumber: 2 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={onSelect}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    fireEvent.click(screen.getByText('zsh — 2'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('click × fires onClose', () => {
    const onClose = vi.fn();
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'terminal', sessionId: 'b', tabNumber: 2 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={onClose}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    const closeButtons = screen.getAllByTitle('Close tab');
    fireEvent.click(closeButtons[1]);
    expect(onClose).toHaveBeenCalledWith('b');
  });

  it('click + fires onCreate', () => {
    const onCreate = vi.fn();
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={onCreate}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    fireEvent.click(screen.getByTitle('New tab'));
    expect(onCreate).toHaveBeenCalled();
  });

  it('tabs have draggable attribute', () => {
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    const tab = screen.getByText('bash — 1').closest('[data-tab]');
    expect(tab?.getAttribute('draggable')).toBe('true');
  });

  it('terminal tab numbering counts only terminal tabs, not settings', () => {
    const entries: TabEntry[] = [
      { type: 'settings' },
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'terminal', sessionId: 'b', tabNumber: 2 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={1}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onSelectSettings={() => {}}
        onCloseSettings={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    expect(screen.getByText('bash — 1')).toBeTruthy();
    expect(screen.getByText('zsh — 2')).toBeTruthy();
  });

  it('tab number is stable — closing tab 1 keeps tab 2 as "— 2"', () => {
    // Tab 'a' was #1, tab 'b' was #2. After closing 'a', 'b' should still show "— 2"
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'terminal', sessionId: 'b', tabNumber: 2 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    expect(screen.getByText('bash — 1')).toBeTruthy();
    expect(screen.getByText('zsh — 2')).toBeTruthy();
  });

  it('after closing tab 1, tab 2 keeps its number', () => {
    // Only tab 'b' remains with tabNumber 2 — it should show "zsh — 2"
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'b', tabNumber: 2 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    expect(screen.getByText('zsh — 2')).toBeTruthy();
  });

  it('settings tab is draggable', () => {
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'settings' },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onSelectSettings={() => {}}
        onCloseSettings={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    const settingsTab = screen.getByText('⚙ Settings').closest('[data-tab]');
    expect(settingsTab?.getAttribute('draggable')).toBe('true');
  });

  it('settings tab dragStart sets settings drag data', () => {
    const onDragStart = vi.fn();
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'settings' },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onSelectSettings={() => {}}
        onCloseSettings={() => {}}
        onDragStart={onDragStart}
        onDragEnd={() => {}}
      />
    );

    const settingsTab = screen.getByText('⚙ Settings').closest('[data-tab]') as HTMLElement;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(settingsTab, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/json',
      JSON.stringify({ type: 'settings', sourcePaneId: 'pane-1' })
    );
  });

  it('clicking settings tab calls onSelectSettings', () => {
    const onSelectSettings = vi.fn();
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'settings' },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onSelectSettings={onSelectSettings}
        onCloseSettings={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    fireEvent.click(screen.getByText('⚙ Settings'));
    expect(onSelectSettings).toHaveBeenCalled();
  });

  it('shows custom title without tab number when session is renamed', () => {
    const renamedSessions: SessionInfo[] = [
      { id: 'a', shell: '/bin/bash', title: 'my server', renamed: true, createdAt: 1000 },
    ];
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={renamedSessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    expect(screen.getByText('my server')).toBeTruthy();
    expect(screen.queryByText('my server — 1')).toBeNull();
  });

  it('shows default title with tab number when session is not renamed', () => {
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );

    expect(screen.getByText('bash — 1')).toBeTruthy();
  });

  it('right-click on terminal tab opens context menu', () => {
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    const { container } = render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onRename={() => {}}
        onSplit={() => {}}
      />
    );

    const tab = screen.getByText('bash — 1').closest('[data-tab]') as HTMLElement;
    fireEvent.contextMenu(tab);

    expect(container.querySelector('.context-menu')).toBeTruthy();
    expect(screen.getByText('Rename')).toBeTruthy();
    expect(screen.getByText('Close')).toBeTruthy();
    expect(screen.getByText('Split Right')).toBeTruthy();
  });

  it('context menu Rename triggers onRename with the right-clicked session', () => {
    const onRename = vi.fn();
    const entries: TabEntry[] = [
      { type: 'terminal', sessionId: 'a', tabNumber: 1 },
      { type: 'terminal', sessionId: 'b', tabNumber: 2 },
    ];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onRename={onRename}
        onSplit={() => {}}
      />
    );

    const tab = screen.getByText('zsh — 2').closest('[data-tab]') as HTMLElement;
    fireEvent.contextMenu(tab);
    fireEvent.click(screen.getByText('Rename'));
    expect(onRename).toHaveBeenCalledWith('b');
  });

  it('context menu Split Right triggers onSplit with session and zone', () => {
    const onSplit = vi.fn();
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onRename={() => {}}
        onSplit={onSplit}
      />
    );

    const tab = screen.getByText('bash — 1').closest('[data-tab]') as HTMLElement;
    fireEvent.contextMenu(tab);
    fireEvent.click(screen.getByText('Split Right'));
    expect(onSplit).toHaveBeenCalledWith('a', 'right');
  });

  it('inline rename shows input and confirms on Enter', () => {
    const onRename = vi.fn();
    const onRenameConfirm = vi.fn();
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onRename={onRename}
        onSplit={() => {}}
        renamingSessionId="a"
        onRenameConfirm={onRenameConfirm}
        onRenameCancel={() => {}}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'my server' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameConfirm).toHaveBeenCalledWith('a', 'my server');
  });

  it('inline rename cancels on Escape', () => {
    const onRenameCancel = vi.fn();
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onRename={() => {}}
        onSplit={() => {}}
        renamingSessionId="a"
        onRenameConfirm={() => {}}
        onRenameCancel={onRenameCancel}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRenameCancel).toHaveBeenCalled();
  });

  it('dragStart calls onDragStart and sets dataTransfer', () => {
    const onDragStart = vi.fn();
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={onDragStart}
        onDragEnd={() => {}}
      />
    );

    const tab = screen.getByText('bash — 1').closest('[data-tab]') as HTMLElement;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(tab, { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith({ type: 'terminal', sessionId: 'a', sourcePaneId: 'pane-1' });
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/json',
      JSON.stringify({ type: 'terminal', sessionId: 'a', sourcePaneId: 'pane-1' })
    );
  });

  it('shows ZOOMED badge when zoomed', () => {
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        zoomed={true}
      />
    );
    expect(screen.getByText('ZOOMED')).toBeTruthy();
  });

  it('hides close button and new tab button when zoomed', () => {
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        zoomed={true}
      />
    );
    expect(screen.queryByTitle('Close tab')).toBeNull();
    expect(screen.queryByTitle('New tab')).toBeNull();
  });

  it('does not show ZOOMED badge when not zoomed', () => {
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    );
    expect(screen.queryByText('ZOOMED')).toBeNull();
  });

  it('context menu hides split and close actions when zoomed', () => {
    const entries: TabEntry[] = [{ type: 'terminal', sessionId: 'a', tabNumber: 1 }];
    render(
      <PaneTabBar
        paneId="pane-1"
        entries={entries}
        activeEntryIndex={0}
        sessions={sessions}
        onSelect={() => {}}
        onClose={() => {}}
        onCreate={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onRename={() => {}}
        onSplit={() => {}}
        zoomed={true}
      />
    );

    const tab = screen.getByText('bash — 1').closest('[data-tab]') as HTMLElement;
    fireEvent.contextMenu(tab);

    expect(screen.getByText('Rename')).toBeTruthy();
    expect(screen.queryByText('Close')).toBeNull();
    expect(screen.queryByText('Split Right')).toBeNull();
    expect(screen.queryByText('Split Left')).toBeNull();
    expect(screen.queryByText('Split Down')).toBeNull();
    expect(screen.queryByText('Split Up')).toBeNull();
  });
});
