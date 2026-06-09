import { useEffect, useRef } from 'react';

interface TabContextMenuProps {
  x: number;
  y: number;
  sessionId: string | null;
  paneId: string;
  isSettings: boolean;
  zoomed?: boolean;
  onRename: () => void;
  onClose: () => void;
  onSplitRight: () => void;
  onSplitLeft: () => void;
  onSplitDown: () => void;
  onSplitUp: () => void;
  onDismiss: () => void;
}

interface MenuItem {
  label: string;
  action: () => void;
}

export function TabContextMenu({
  x,
  y,
  isSettings,
  zoomed,
  onRename,
  onClose,
  onSplitRight,
  onSplitLeft,
  onSplitDown,
  onSplitUp,
  onDismiss,
}: TabContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDismiss]);

  const items: MenuItem[] = isSettings
    ? [{ label: 'Close', action: onClose }]
    : zoomed
      ? [{ label: 'Rename', action: onRename }]
      : [
          { label: 'Rename', action: onRename },
          { label: 'Close', action: onClose },
          { label: 'Split Right', action: onSplitRight },
          { label: 'Split Left', action: onSplitLeft },
          { label: 'Split Down', action: onSplitDown },
          { label: 'Split Up', action: onSplitUp },
        ];

  return (
    <div ref={ref} className="context-menu" style={{ left: `${x}px`, top: `${y}px` }}>
      {items.map((item) => (
        <div key={item.label} className="context-menu-item" onClick={item.action}>
          {item.label}
        </div>
      ))}
    </div>
  );
}
