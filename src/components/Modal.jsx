import React from 'react';

export default function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}
