export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center';

export type TabEntry =
  | { type: 'terminal'; sessionId: string; tabNumber: number }
  | { type: 'settings' };

export type LayoutNode =
  | { type: 'leaf'; paneId: string }
  | {
      type: 'split';
      direction: 'horizontal' | 'vertical';
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

export interface Pane {
  id: string;
  entries: TabEntry[];
  activeEntryIndex: number | null;
}

export type DragData =
  | { type: 'terminal'; sessionId: string; sourcePaneId: string }
  | { type: 'settings'; sourcePaneId: string };
