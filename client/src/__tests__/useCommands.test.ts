import { describe, it, expect, vi } from 'vitest';
import { useCommands } from '../hooks/useCommands.js';
import type { LayoutState } from '../hooks/useLayout.js';
import type { Pane, TabEntry } from '../types/layout.js';
import { DEFAULT_SETTINGS, THEMES, type Settings } from '../../../shared/settings.js';

interface CommandOptions {
  onRenameRequest?: (sessionId: string) => void;
}

function mockLayout(overrides: Partial<LayoutState> = {}): LayoutState {
  const entries: TabEntry[] = [
    { type: 'terminal', sessionId: 'sess-1', tabNumber: 1 },
    { type: 'terminal', sessionId: 'sess-2', tabNumber: 2 },
  ];
  const panes: Record<string, Pane> = {
    'pane-0': { id: 'pane-0', entries, activeEntry: entries[0] },
  };
  return {
    tree: { type: 'leaf', paneId: 'pane-0' },
    panes,
    sessions: [
      { id: 'sess-1', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 1000 },
      { id: 'sess-2', shell: '/bin/zsh', title: 'zsh', renamed: false, createdAt: 2000 },
    ],
    focusedPaneId: 'pane-0',
    zoomedPaneId: null,
    connected: true,
    retryIn: null,
    splitPane: vi.fn(),
    moveTab: vi.fn(),
    setActiveSession: vi.fn(),
    setFocusedPane: vi.fn(),
    createSession: vi.fn(),
    closeSession: vi.fn(),
    openSettings: vi.fn(),
    selectSettings: vi.fn(),
    moveSettings: vi.fn(),
    splitSettings: vi.fn(),
    closeSettings: vi.fn(),
    createSplitSession: vi.fn(),
    renameSession: vi.fn(),
    toggleZoom: vi.fn(),
    ...overrides,
  };
}

describe('useCommands', () => {
  it('returns 8 commands', () => {
    const commands = useCommands(mockLayout(), DEFAULT_SETTINGS, vi.fn());
    expect(commands).toHaveLength(9);
  });

  it('returns commands with correct labels', () => {
    const commands = useCommands(mockLayout(), DEFAULT_SETTINGS, vi.fn());
    const labels = commands.map((c) => c.label);
    expect(labels).toContain('New Terminal');
    expect(labels).toContain('Close Terminal');
    expect(labels).toContain('Open Settings');
    expect(labels).toContain('Select Color Theme');
    expect(labels).toContain('Split Right');
    expect(labels).toContain('Split Left');
    expect(labels).toContain('Split Down');
    expect(labels).toContain('Split Up');
  });

  it('New Terminal calls createSession', () => {
    const layout = mockLayout();
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'New Terminal')!;
    cmd.action!();
    expect(layout.createSession).toHaveBeenCalled();
  });

  it('Close Terminal calls closeSession with active session of focused pane', () => {
    const layout = mockLayout();
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Close Terminal')!;
    cmd.action!();
    expect(layout.closeSession).toHaveBeenCalledWith('sess-1');
  });

  it('Close Terminal does nothing when no focused pane', () => {
    const layout = mockLayout({ focusedPaneId: null });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Close Terminal')!;
    cmd.action!();
    expect(layout.closeSession).not.toHaveBeenCalled();
  });

  it('each command has a unique id', () => {
    const commands = useCommands(mockLayout(), DEFAULT_SETTINGS, vi.fn());
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns 8 commands including Select Color Theme', () => {
    const commands = useCommands(mockLayout(), DEFAULT_SETTINGS, vi.fn());
    expect(commands).toHaveLength(9);
    const labels = commands.map((c) => c.label);
    expect(labels).toContain('Select Color Theme');
  });

  it('Select Color Theme has children for each theme', () => {
    const commands = useCommands(mockLayout(), DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Select Color Theme')!;
    expect(cmd.children).toBeDefined();
    expect(cmd.children!.length).toBe(Object.keys(THEMES).length);
    expect(cmd.children!.map(c => c.label)).toContain('catppuccin-mocha');
    expect(cmd.children!.map(c => c.label)).toContain('catppuccin-latte');
  });

  it('Select Color Theme child action calls updateSettings', () => {
    const updateSettings = vi.fn();
    const commands = useCommands(mockLayout(), DEFAULT_SETTINGS, updateSettings);
    const cmd = commands.find((c) => c.label === 'Select Color Theme')!;
    const latteChild = cmd.children!.find(c => c.label === 'catppuccin-latte')!;
    latteChild.action!();
    expect(updateSettings).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      terminal: { ...DEFAULT_SETTINGS.terminal, theme: 'catppuccin-latte' },
    });
  });

  it('Split Right calls createSplitSession with focused pane', () => {
    const layout = mockLayout();
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Split Right')!;
    cmd.action!();
    expect(layout.createSplitSession).toHaveBeenCalledWith('pane-0', 'right');
  });

  it('Split Left calls createSplitSession with left zone', () => {
    const layout = mockLayout();
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Split Left')!;
    cmd.action!();
    expect(layout.createSplitSession).toHaveBeenCalledWith('pane-0', 'left');
  });

  it('Split Down calls createSplitSession with bottom zone', () => {
    const layout = mockLayout();
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Split Down')!;
    cmd.action!();
    expect(layout.createSplitSession).toHaveBeenCalledWith('pane-0', 'bottom');
  });

  it('Split Up calls createSplitSession with top zone', () => {
    const layout = mockLayout();
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Split Up')!;
    cmd.action!();
    expect(layout.createSplitSession).toHaveBeenCalledWith('pane-0', 'top');
  });

  it('Rename Terminal calls onRenameRequest with active session', () => {
    const onRenameRequest = vi.fn();
    const layout = mockLayout();
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn(), { onRenameRequest });
    const cmd = commands.find((c) => c.label === 'Rename Terminal')!;
    expect(cmd).toBeDefined();
    cmd.action!();
    expect(onRenameRequest).toHaveBeenCalledWith('sess-1');
  });

  it('Rename Terminal does nothing when no active session', () => {
    const onRenameRequest = vi.fn();
    const layout = mockLayout({ focusedPaneId: null });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn(), { onRenameRequest });
    const cmd = commands.find((c) => c.label === 'Rename Terminal')!;
    cmd.action!();
    expect(onRenameRequest).not.toHaveBeenCalled();
  });

  it('Split commands do nothing when no focused pane', () => {
    const layout = mockLayout({ focusedPaneId: null });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    for (const label of ['Split Right', 'Split Left', 'Split Down', 'Split Up']) {
      const cmd = commands.find((c) => c.label === label)!;
      cmd.action!();
    }
    expect(layout.createSplitSession).not.toHaveBeenCalled();
  });

  it('New Terminal is no-op when zoomed', () => {
    const layout = mockLayout({ zoomedPaneId: 'pane-0' });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'New Terminal')!;
    cmd.action!();
    expect(layout.createSession).not.toHaveBeenCalled();
  });

  it('Close Terminal is no-op when zoomed', () => {
    const layout = mockLayout({ zoomedPaneId: 'pane-0' });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Close Terminal')!;
    cmd.action!();
    expect(layout.closeSession).not.toHaveBeenCalled();
  });

  it('Split commands are no-ops when zoomed', () => {
    const layout = mockLayout({ zoomedPaneId: 'pane-0' });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    for (const label of ['Split Right', 'Split Left', 'Split Down', 'Split Up']) {
      const cmd = commands.find((c) => c.label === label)!;
      cmd.action!();
    }
    expect(layout.createSplitSession).not.toHaveBeenCalled();
  });

  it('Open Settings is no-op when zoomed', () => {
    const layout = mockLayout({ zoomedPaneId: 'pane-0' });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Open Settings')!;
    cmd.action!();
    expect(layout.openSettings).not.toHaveBeenCalled();
  });

  it('Toggle Zoom Pane is hidden when only one pane exists', () => {
    const layout = mockLayout();
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Toggle Zoom Pane');
    expect(cmd).toBeUndefined();
  });

  it('Toggle Zoom Pane is shown when multiple panes exist', () => {
    const panes = {
      'pane-0': { id: 'pane-0', entries: [{ type: 'terminal' as const, sessionId: 'sess-1', tabNumber: 1 }], activeEntry: { type: 'terminal' as const, sessionId: 'sess-1', tabNumber: 1 } },
      'pane-1': { id: 'pane-1', entries: [{ type: 'terminal' as const, sessionId: 'sess-2', tabNumber: 2 }], activeEntry: { type: 'terminal' as const, sessionId: 'sess-2', tabNumber: 2 } },
    };
    const layout = mockLayout({ panes });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Toggle Zoom Pane');
    expect(cmd).toBeDefined();
  });

  it('Toggle Zoom Pane calls toggleZoom', () => {
    const panes = {
      'pane-0': { id: 'pane-0', entries: [{ type: 'terminal' as const, sessionId: 'sess-1', tabNumber: 1 }], activeEntry: { type: 'terminal' as const, sessionId: 'sess-1', tabNumber: 1 } },
      'pane-1': { id: 'pane-1', entries: [{ type: 'terminal' as const, sessionId: 'sess-2', tabNumber: 2 }], activeEntry: { type: 'terminal' as const, sessionId: 'sess-2', tabNumber: 2 } },
    };
    const layout = mockLayout({ panes });
    const commands = useCommands(layout, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Toggle Zoom Pane')!;
    expect(cmd).toBeDefined();
    cmd.action!();
    expect(layout.toggleZoom).toHaveBeenCalled();
  });
});
