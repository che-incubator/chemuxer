import { describe, it, expect, vi } from 'vitest';
import { useCommands } from '../hooks/useCommands.js';
import type { CommandDeps } from '../hooks/useCommands.js';
import type { Pane, TabEntry } from '../types/layout.js';
import { DEFAULT_SETTINGS, THEMES, type Settings } from '@chemuxer/shared';

function mockDeps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  const entries: TabEntry[] = [
    { type: 'terminal', sessionId: 'sess-1', tabNumber: 1 },
    { type: 'terminal', sessionId: 'sess-2', tabNumber: 2 },
  ];
  const panes: Record<string, Pane> = {
    'pane-0': { id: 'pane-0', entries, activeEntryIndex: 0 },
  };
  return {
    panes,
    focusedPaneId: 'pane-0',
    zoomedPaneId: null,
    createSession: vi.fn(),
    closeSession: vi.fn(),
    openSettings: vi.fn(),
    createSplitSession: vi.fn(),
    toggleZoom: vi.fn(),
    containers: [],
    ...overrides,
  };
}

describe('useCommands', () => {
  it('returns 8 commands', () => {
    const commands = useCommands(mockDeps(), DEFAULT_SETTINGS, vi.fn());
    expect(commands).toHaveLength(9);
  });

  it('returns commands with correct labels', () => {
    const commands = useCommands(mockDeps(), DEFAULT_SETTINGS, vi.fn());
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
    const deps = mockDeps();
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'New Terminal')!;
    cmd.action!();
    expect(deps.createSession).toHaveBeenCalled();
  });

  it('Close Terminal calls closeSession with active session of focused pane', () => {
    const deps = mockDeps();
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Close Terminal')!;
    cmd.action!();
    expect(deps.closeSession).toHaveBeenCalledWith('sess-1');
  });

  it('Close Terminal does nothing when no focused pane', () => {
    const deps = mockDeps({ focusedPaneId: null });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Close Terminal')!;
    cmd.action!();
    expect(deps.closeSession).not.toHaveBeenCalled();
  });

  it('each command has a unique id', () => {
    const commands = useCommands(mockDeps(), DEFAULT_SETTINGS, vi.fn());
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns 8 commands including Select Color Theme', () => {
    const commands = useCommands(mockDeps(), DEFAULT_SETTINGS, vi.fn());
    expect(commands).toHaveLength(9);
    const labels = commands.map((c) => c.label);
    expect(labels).toContain('Select Color Theme');
  });

  it('Select Color Theme has children for each theme', () => {
    const commands = useCommands(mockDeps(), DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Select Color Theme')!;
    expect(cmd.children).toBeDefined();
    expect(cmd.children!.length).toBe(Object.keys(THEMES).length);
    expect(cmd.children!.map(c => c.label)).toContain('catppuccin-mocha');
    expect(cmd.children!.map(c => c.label)).toContain('catppuccin-latte');
  });

  it('Select Color Theme child action calls updateSettings', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const commands = useCommands(mockDeps(), DEFAULT_SETTINGS, updateSettings);
    const cmd = commands.find((c) => c.label === 'Select Color Theme')!;
    const latteChild = cmd.children!.find(c => c.label === 'catppuccin-latte')!;
    latteChild.action!();
    expect(updateSettings).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      terminal: { ...DEFAULT_SETTINGS.terminal, theme: 'catppuccin-latte' },
    });
  });

  it('Split Right calls createSplitSession with focused pane', () => {
    const deps = mockDeps();
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Split Right')!;
    cmd.action!();
    expect(deps.createSplitSession).toHaveBeenCalledWith('pane-0', 'right');
  });

  it('Split Left calls createSplitSession with left zone', () => {
    const deps = mockDeps();
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Split Left')!;
    cmd.action!();
    expect(deps.createSplitSession).toHaveBeenCalledWith('pane-0', 'left');
  });

  it('Split Down calls createSplitSession with bottom zone', () => {
    const deps = mockDeps();
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Split Down')!;
    cmd.action!();
    expect(deps.createSplitSession).toHaveBeenCalledWith('pane-0', 'bottom');
  });

  it('Split Up calls createSplitSession with top zone', () => {
    const deps = mockDeps();
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Split Up')!;
    cmd.action!();
    expect(deps.createSplitSession).toHaveBeenCalledWith('pane-0', 'top');
  });

  it('Rename Terminal calls onRenameRequest with active session', () => {
    const onRenameRequest = vi.fn();
    const deps = mockDeps();
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn(), { onRenameRequest });
    const cmd = commands.find((c) => c.label === 'Rename Terminal')!;
    expect(cmd).toBeDefined();
    cmd.action!();
    expect(onRenameRequest).toHaveBeenCalledWith('sess-1');
  });

  it('Rename Terminal does nothing when no active session', () => {
    const onRenameRequest = vi.fn();
    const deps = mockDeps({ focusedPaneId: null });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn(), { onRenameRequest });
    const cmd = commands.find((c) => c.label === 'Rename Terminal')!;
    cmd.action!();
    expect(onRenameRequest).not.toHaveBeenCalled();
  });

  it('Split commands do nothing when no focused pane', () => {
    const deps = mockDeps({ focusedPaneId: null });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    for (const label of ['Split Right', 'Split Left', 'Split Down', 'Split Up']) {
      const cmd = commands.find((c) => c.label === label)!;
      cmd.action!();
    }
    expect(deps.createSplitSession).not.toHaveBeenCalled();
  });

  it('New Terminal is disabled when zoomed', () => {
    const deps = mockDeps({ zoomedPaneId: 'pane-0' });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'New Terminal')!;
    expect(cmd.disabled).toBe(true);
  });

  it('Close Terminal is disabled when zoomed', () => {
    const deps = mockDeps({ zoomedPaneId: 'pane-0' });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Close Terminal')!;
    expect(cmd.disabled).toBe(true);
  });

  it('Split commands are disabled when zoomed', () => {
    const deps = mockDeps({ zoomedPaneId: 'pane-0' });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    for (const label of ['Split Right', 'Split Left', 'Split Down', 'Split Up']) {
      const cmd = commands.find((c) => c.label === label)!;
      expect(cmd.disabled).toBe(true);
    }
  });

  it('Open Settings is disabled when zoomed', () => {
    const deps = mockDeps({ zoomedPaneId: 'pane-0' });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Open Settings')!;
    expect(cmd.disabled).toBe(true);
  });

  it('Toggle Zoom Pane is hidden when only one pane exists', () => {
    const deps = mockDeps();
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Toggle Zoom Pane');
    expect(cmd).toBeUndefined();
  });

  it('Toggle Zoom Pane is shown when multiple panes exist', () => {
    const panes = {
      'pane-0': { id: 'pane-0', entries: [{ type: 'terminal' as const, sessionId: 'sess-1', tabNumber: 1 }], activeEntryIndex: 0 },
      'pane-1': { id: 'pane-1', entries: [{ type: 'terminal' as const, sessionId: 'sess-2', tabNumber: 2 }], activeEntryIndex: 0 },
    };
    const deps = mockDeps({ panes });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Toggle Zoom Pane');
    expect(cmd).toBeDefined();
  });

  it('Toggle Zoom Pane calls toggleZoom', () => {
    const panes = {
      'pane-0': { id: 'pane-0', entries: [{ type: 'terminal' as const, sessionId: 'sess-1', tabNumber: 1 }], activeEntryIndex: 0 },
      'pane-1': { id: 'pane-1', entries: [{ type: 'terminal' as const, sessionId: 'sess-2', tabNumber: 2 }], activeEntryIndex: 0 },
    };
    const deps = mockDeps({ panes });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());
    const cmd = commands.find((c) => c.label === 'Toggle Zoom Pane')!;
    expect(cmd).toBeDefined();
    cmd.action!();
    expect(deps.toggleZoom).toHaveBeenCalled();
  });

  it('adds per-container commands when multiple containers exist', () => {
    const deps = mockDeps({
      containers: [
        { name: 'dev', state: 'running', ready: true, isDefault: true },
        { name: 'tools', state: 'running', ready: true, isDefault: false },
      ],
    });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());

    const newTerminal = commands.find(c => c.id === 'new-terminal');
    expect(newTerminal?.label).toBe('New Terminal');
    expect(newTerminal?.action).toBeDefined();
    expect(newTerminal?.children).toBeUndefined();

    const toolsCmd = commands.find(c => c.id === 'new-terminal-tools');
    expect(toolsCmd?.label).toBe('New Terminal in Container: tools');
    expect(toolsCmd?.action).toBeDefined();
  });

  it('per-container command calls createSession with container name', () => {
    const deps = mockDeps({
      containers: [
        { name: 'dev', state: 'running', ready: true, isDefault: true },
        { name: 'tools', state: 'running', ready: true, isDefault: false },
      ],
    });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());

    const toolsCmd = commands.find(c => c.id === 'new-terminal-tools')!;
    toolsCmd.action!();
    expect(deps.createSession).toHaveBeenCalledWith('tools');
  });

  it('New Terminal calls createSession without container (default)', () => {
    const deps = mockDeps({
      containers: [
        { name: 'dev', state: 'running', ready: true, isDefault: true },
        { name: 'tools', state: 'running', ready: true, isDefault: false },
      ],
    });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());

    const newTerminal = commands.find(c => c.id === 'new-terminal')!;
    newTerminal.action!();
    expect(deps.createSession).toHaveBeenCalledWith();
  });

  it('disables per-container command when container is not running', () => {
    const deps = mockDeps({
      containers: [
        { name: 'dev', state: 'running', ready: true, isDefault: true },
        { name: 'tools', state: 'waiting', ready: false, isDefault: false },
      ],
    });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());

    const toolsCmd = commands.find(c => c.id === 'new-terminal-tools');
    expect(toolsCmd?.disabled).toBe(true);
  });

  it('no per-container commands with single container', () => {
    const deps = mockDeps({
      containers: [
        { name: 'dev', state: 'running', ready: true, isDefault: true },
      ],
    });
    const commands = useCommands(deps, DEFAULT_SETTINGS, vi.fn());

    const newTerminal = commands.find(c => c.id === 'new-terminal');
    expect(newTerminal?.action).toBeDefined();
    expect(commands.find(c => c.id.startsWith('new-terminal-'))).toBeUndefined();
  });
});
