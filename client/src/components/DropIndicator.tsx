import type { DropZone } from '../types/layout.js';

interface DropIndicatorProps {
  zone: DropZone | null;
}

export function DropIndicator({ zone }: DropIndicatorProps) {
  if (!zone) return null;

  let style: React.CSSProperties;

  switch (zone) {
    case 'left':
      style = { top: 0, left: 0, bottom: 0, width: '50%' };
      break;
    case 'right':
      style = { top: 0, right: 0, bottom: 0, width: '50%' };
      break;
    case 'top':
      style = { top: 0, left: 0, right: 0, height: '50%' };
      break;
    case 'bottom':
      style = { bottom: 0, left: 0, right: 0, height: '50%' };
      break;
    case 'center':
      style = { top: 0, left: 0, right: 0, bottom: 0 };
      break;
  }

  return (
    <div className="drop-indicator" style={style} />
  );
}
