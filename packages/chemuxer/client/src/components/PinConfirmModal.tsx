interface PinConfirmModalProps {
  sessionTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PinConfirmModal({ sessionTitle, onConfirm, onCancel }: PinConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Close Pinned Session?</h3>
        <p>Session "{sessionTitle}" is pinned. Are you sure you want to close it?</p>
        <div className="modal-actions">
          <button className="modal-btn modal-btn-cancel" onClick={onCancel} autoFocus>Cancel</button>
          <button className="modal-btn modal-btn-danger" onClick={onConfirm}>Close Anyway</button>
        </div>
      </div>
    </div>
  );
}
