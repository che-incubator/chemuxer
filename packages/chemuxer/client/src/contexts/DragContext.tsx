import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import type { DragData } from '../types/layout.js';

interface DragContextValue {
  isDragging: boolean;
  dragData: DragData | null;
  startDrag: (data: DragData) => void;
  endDrag: () => void;
}

const DragContext = createContext<DragContextValue>({
  isDragging: false,
  dragData: null,
  startDrag: () => {},
  endDrag: () => {},
});

export function useDrag(): DragContextValue {
  return useContext(DragContext);
}

export function DragProvider({ children }: { children: ReactNode }) {
  const [dragData, setDragData] = useState<DragData | null>(null);

  const startDrag = useCallback((data: DragData) => {
    setDragData(data);
  }, []);

  const endDrag = useCallback(() => {
    setDragData(null);
  }, []);

  const value = useMemo(() => ({
    isDragging: dragData !== null,
    dragData,
    startDrag,
    endDrag,
  }), [dragData, startDrag, endDrag]);

  return (
    <DragContext.Provider value={value}>
      {children}
    </DragContext.Provider>
  );
}
