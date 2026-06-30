import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

const FeedbackContext = createContext(null);

let toastCounter = 0;

const TOAST_META = {
  success: { title: 'Concluído', icon: '✓' },
  error: { title: 'Erro', icon: '!' },
  info: { title: 'Informação', icon: 'i' },
  loading: { title: 'Processando', icon: '…' },
};

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((item) => {
        const meta = TOAST_META[item.type] || TOAST_META.info;
        return (
          <div
            key={item.id}
            className={`toast toast-${item.type}`}
            role={item.type === 'error' ? 'alert' : 'status'}
            aria-live={item.type === 'error' ? 'assertive' : 'polite'}
          >
            <span className={`toast-icon toast-icon-${item.type}`} aria-hidden="true">
              {item.type === 'loading' ? <span className="toast-spinner" /> : meta.icon}
            </span>
            <div className="toast-body">
              {item.title && <strong className="toast-title">{item.title}</strong>}
              <span className="toast-message">{item.message}</span>
            </div>
            {item.type !== 'loading' && (
              <button
                type="button"
                className="toast-close"
                onClick={() => onDismiss(item.id)}
                aria-label="Fechar"
              >
                ×
              </button>
            )}
            {item.type !== 'loading' && item.duration > 0 && (
              <span
                className="toast-progress"
                style={{ animationDuration: `${item.duration}ms` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConfirmDialog({
  title = 'Confirmar ação',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="modal-overlay confirm-dialog-overlay" onClick={onCancel}>
      <div
        className="modal confirm-dialog-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="modal-header">
          <h3 id="confirm-dialog-title">{title}</h3>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer picker-footer confirm-exit-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-${variant === 'danger' ? 'danger' : 'primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolveRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'success', duration = 4500, title = null) => {
    const id = ++toastCounter;
    const meta = TOAST_META[type] || TOAST_META.info;
    setToasts((prev) => [...prev.slice(-4), {
      id,
      message,
      type,
      title: title || meta.title,
      duration,
    }]);
    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration);
    }
    return id;
  }, [dismissToast]);

  const success = useCallback(
    (message, duration = 6500) => toast(message, 'success', duration, 'Salvo com sucesso'),
    [toast]
  );

  const error = useCallback(
    (message, duration = 9000) => toast(message, 'error', duration, 'Erro'),
    [toast]
  );

  const info = useCallback(
    (message, duration = 5500) => toast(message, 'info', duration, 'Aviso'),
    [toast]
  );

  const loading = useCallback(
    (message = 'Aguarde...') => toast(message, 'loading', 0, 'Processando'),
    [toast]
  );

  const runWithFeedback = useCallback(async (asyncFn, messages) => {
    const loadingId = loading(messages?.loading || 'Processando...');
    try {
      const result = await asyncFn();
      dismissToast(loadingId);
      if (result?.cancelled) return result;
      if (messages?.success) success(messages.success);
      return result;
    } catch (err) {
      dismissToast(loadingId);
      error(messages?.error || err.message || 'Não foi possível concluir a ação.');
      throw err;
    }
  }, [loading, dismissToast, success, error]);

  const confirm = useCallback((options) => new Promise((resolve) => {
    confirmResolveRef.current = resolve;
    setConfirmState(typeof options === 'string' ? { message: options } : options);
  }), []);

  const closeConfirm = useCallback((result) => {
    if (confirmResolveRef.current) {
      confirmResolveRef.current(result);
      confirmResolveRef.current = null;
    }
    setConfirmState(null);
  }, []);

  return (
    <FeedbackContext.Provider value={{
      toast,
      success,
      error,
      info,
      loading,
      dismissToast,
      runWithFeedback,
      confirm,
    }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {confirmState && (
        <ConfirmDialog
          {...confirmState}
          onConfirm={() => closeConfirm(true)}
          onCancel={() => closeConfirm(false)}
        />
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback deve ser usado dentro de FeedbackProvider');
  }
  return ctx;
}
