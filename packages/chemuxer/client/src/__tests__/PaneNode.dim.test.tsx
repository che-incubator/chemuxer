// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PaneNode } from '../components/PaneNode.js';
import type { Settings } from '@chemuxer/shared';
import type { Pane } from '../types/layout.js';

vi.mock('../components/PaneTabBar.js', () => ({
  PaneTabBar: () => null,
}));

vi.mock('../components/Terminal.js', () => ({
  Terminal: () => null,
}));

vi.mock('../components/SettingsEditor.js', () => ({
  SettingsEditor: () => null,
}));

vi.mock('../components/DropIndicator.js', () => ({
  DropIndicator: () => null,
}));

vi.mock('../contexts/DragContext.js', () => ({
  useDrag: () => ({
    isDragging: false,
    dragData: null,
    startDrag: vi.fn(),
    endDrag: vi.fn(),
  }),
}));

const makePaneNodeProps = (overrides?: Partial<{
  focusedPaneId: string | null;
  paneCount: number;
  zoomed: boolean;
  settings: Settings;
}>) => {
  const pane: Pane = {
    id: 'pane-1',
    entries: [],
    activeEntryIndex: null,
  };

  const defaultSettings: Settings = {
    terminal: {
      fontFamily: 'monospace',
      fontSize: 14,
      theme: 'catppuccin-mocha',
      dimInactivePanes: true,
      inactivePaneDimAmount: 0.7,
    },
    shell: { path: '' },
    scrollback: { lines: 5000 },
  };

  return {
    pane,
    sessions: [],
    wsUrl: 'ws://localhost',
    settings: overrides && overrides.settings ? overrides.settings : defaultSettings,
    focusedPaneId: overrides && overrides.focusedPaneId !== undefined ? overrides.focusedPaneId : 'pane-other',
    paneCount: overrides && overrides.paneCount !== undefined ? overrides.paneCount : 2,
    zoomed: overrides && overrides.zoomed !== undefined ? overrides.zoomed : false,
    onSelectSession: vi.fn(),
    onCloseSession: vi.fn(),
    onCreateSession: vi.fn(),
    onPinSession: vi.fn(),
    onSplit: vi.fn(),
    onMoveTab: vi.fn(),
    onFocus: vi.fn(),
    onSaveSettings: vi.fn(),
    onSelectSettings: vi.fn(),
    onMoveSettings: vi.fn(),
    onSplitSettings: vi.fn(),
    onCloseSettings: vi.fn(),
  };
};

describe('PaneNode dim behavior', () => {
  it('applies brightness filter when inactive, multiPane, and dimInactivePanes is true', () => {
    const props = makePaneNodeProps({
      focusedPaneId: 'pane-other',
      paneCount: 2,
    });
    const { container } = render(<PaneNode {...props} />);
    const el = container.querySelector('.pane-node') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.filter).toBe('brightness(0.7)');
  });

  it('does not apply filter when pane is the focused (active) pane', () => {
    const props = makePaneNodeProps({
      focusedPaneId: 'pane-1',
      paneCount: 2,
    });
    const { container } = render(<PaneNode {...props} />);
    const el = container.querySelector('.pane-node') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.filter).toBe('');
  });

  it('does not apply filter when paneCount is 1', () => {
    const props = makePaneNodeProps({
      focusedPaneId: 'pane-other',
      paneCount: 1,
    });
    const { container } = render(<PaneNode {...props} />);
    const el = container.querySelector('.pane-node') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.filter).toBe('');
  });

  it('does not apply filter when zoomed is true (paneCount is 1 in zoomed mode)', () => {
    const props = makePaneNodeProps({
      focusedPaneId: 'pane-other',
      paneCount: 1,
      zoomed: true,
    });
    const { container } = render(<PaneNode {...props} />);
    const el = container.querySelector('.pane-node') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.filter).toBe('');
  });

  it('does not apply filter when dimInactivePanes is false', () => {
    const settings: Settings = {
      terminal: {
        fontFamily: 'monospace',
        fontSize: 14,
        theme: 'catppuccin-mocha',
        dimInactivePanes: false,
        inactivePaneDimAmount: 0.7,
      },
      shell: { path: '' },
      scrollback: { lines: 5000 },
    };
    const props = makePaneNodeProps({
      focusedPaneId: 'pane-other',
      paneCount: 2,
      settings,
    });
    const { container } = render(<PaneNode {...props} />);
    const el = container.querySelector('.pane-node') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.filter).toBe('');
  });

  it('applies brightness(0.5) when inactivePaneDimAmount is 0.5 and pane is inactive', () => {
    const settings: Settings = {
      terminal: {
        fontFamily: 'monospace',
        fontSize: 14,
        theme: 'catppuccin-mocha',
        dimInactivePanes: true,
        inactivePaneDimAmount: 0.5,
      },
      shell: { path: '' },
      scrollback: { lines: 5000 },
    };
    const props = makePaneNodeProps({
      focusedPaneId: 'pane-other',
      paneCount: 2,
      settings,
    });
    const { container } = render(<PaneNode {...props} />);
    const el = container.querySelector('.pane-node') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.filter).toBe('brightness(0.5)');
  });

  it('.pane-node class is always present on the container element', () => {
    // The CSS rule .pane-node { transition: filter 150ms ease } is defined in App.css.
    // We verify the element always carries the pane-node class so the transition applies.
    const props = makePaneNodeProps({
      focusedPaneId: 'pane-1',
      paneCount: 1,
    });
    const { container } = render(<PaneNode {...props} />);
    const el = container.querySelector('.pane-node');
    expect(el).toBeTruthy();
  });
});
