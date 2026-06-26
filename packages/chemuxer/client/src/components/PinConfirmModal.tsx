import { useEffect } from 'react';

interface PinConfirmModalProps {
  sessionTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PinConfirmModal({ sessionTitle, onConfirm, onCancel }: PinConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pin-modal-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="pin-modal-title">Close Pinned Session?</h3>
        <p>Session &ldquo;{sessionTitle}&rdquo; is pinned. Are you sure you want to close it?</p>
        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={onCancel} autoFocus>Cancel</button>
          <button className="modal-btn modal-btn-danger" onClick={onConfirm}>Close Anyway</button>
        </div>
      </div>
    </div>
  );
}
