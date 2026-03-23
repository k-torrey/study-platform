import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

const TOAST_ICONS = {
  error: '\u2716',
  success: '\u2714',
  info: '\u2139',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'error', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, 200);
      }, duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 200);
  }, []);

  const toast = useCallback({
    error: (msg) => addToast(msg, 'error'),
    success: (msg) => addToast(msg, 'success'),
    info: (msg) => addToast(msg, 'info'),
  }, [addToast]);

  useEffect(() => {
    const origAlert = window.alert;
    window.alert = (msg) => addToast(String(msg), 'error');
    return () => { window.alert = origAlert; };
  }, [addToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container" role="alert" aria-live="polite">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`toast toast-${t.type} ${t.exiting ? 'toast-exit' : ''}`}
              onClick={() => removeToast(t.id)}
            >
              <span className="toast-icon">{TOAST_ICONS[t.type]}</span>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
