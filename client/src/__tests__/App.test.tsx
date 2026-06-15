import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

vi.mock('../hooks/useControl.js', () => ({
  useControl: () => ({
    sessions: [],
    createSession: vi.fn(),
    closeSession: vi.fn(),
    renameSession: vi.fn(),
    connected: true,
    retryIn: null,
  }),
}));

vi.mock('../hooks/useLayout.js', () => ({
  useLayout: () => ({
    tree: { type: 'leaf', paneId: 'pane-0' },
    panes: { 'pane-0': { id: 'pane-0', entries: [], activeEntry: null } },
    focusedPaneId: 'pane-0',
    zoomedPaneId: null,
    splitPane: vi.fn(),
    moveTab: vi.fn(),
    setActiveSession: vi.fn(),
    setFocusedPane: vi.fn(),
    openSettings: vi.fn(),
    selectSettings: vi.fn(),
    moveSettings: vi.fn(),
    splitSettings: vi.fn(),
    closeSettings: vi.fn(),
    createSplitSession: vi.fn(),
    toggleZoom: vi.fn(),
  }),
}));

vi.mock('../hooks/useSettings.js', () => ({
  useSettings: () => ({
    settings: {
      terminal: { fontFamily: 'monospace', fontSize: 14, theme: 'catppuccin-mocha' },
      shell: { path: '' },
      scrollback: { size: 102400 },
    },
    updateSettings: vi.fn(),
    applySettingsChanged: vi.fn(),
  }),
}));

vi.mock('../hooks/useCommands.js', () => ({
  useCommands: () => [],
}));

vi.mock('../components/LayoutRenderer.js', () => ({
  LayoutRenderer: () => null,
}));

vi.mock('../components/CommandPalette.js', () => ({
  CommandPalette: ({ open }: { open: boolean }) => (
    open ? <div data-testid="palette">palette</div> : null
  ),
}));

describe('App keybindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('F1 opens the command palette', async () => {
    const { App } = await import('../App.js');
    const { container, queryByTestId } = render(<App />);

    expect(queryByTestId('palette')).toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    });

    expect(queryByTestId('palette')).not.toBeNull();
  });

  it('F1 toggles the command palette closed', async () => {
    const { App } = await import('../App.js');
    const { queryByTestId } = render(<App />);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    });
    expect(queryByTestId('palette')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    });
    expect(queryByTestId('palette')).toBeNull();
  });

  it('Cmd+Shift+P still opens the command palette', async () => {
    const { App } = await import('../App.js');
    const { queryByTestId } = render(<App />);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'p', shiftKey: true, metaKey: true, bubbles: true,
      }));
    });

    expect(queryByTestId('palette')).not.toBeNull();
  });

  it('F1 is intercepted and stopped before child elements can process it', async () => {
    const { App } = await import('../App.js');
    const { container } = render(<App />);

    const childSaw = vi.fn();
    container.addEventListener('keydown', childSaw);

    act(() => {
      container.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'F1', bubbles: true, cancelable: true,
      }));
    });

    expect(childSaw).not.toHaveBeenCalled();
  });

  it('sets CSS custom properties from theme on mount', async () => {
    const { App } = await import('../App.js');
    render(<App />);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--ch-base')).toBe('#1e1e2e');
    expect(root.style.getPropertyValue('--ch-mantle')).toBe('#181825');
    expect(root.style.getPropertyValue('--ch-crust')).toBe('#11111b');
    expect(root.style.getPropertyValue('--ch-surface0')).toBe('#313244');
    expect(root.style.getPropertyValue('--ch-overlay0')).toBe('#6c7086');
    expect(root.style.getPropertyValue('--ch-text')).toBe('#cdd6f4');
    expect(root.style.getPropertyValue('--ch-subtext0')).toBe('#a6adc8');
    expect(root.style.getPropertyValue('--ch-blue')).toBe('#89b4fa');
    expect(root.style.getPropertyValue('--ch-red')).toBe('#f38ba8');
  });
});
