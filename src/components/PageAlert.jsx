import { useEffect, useRef } from 'react';
import { useFeedback } from '../context/FeedbackContext';

const ALERT_META = {
  error: { icon: '⚠', label: 'Erro' },
  success: { icon: '✓', label: 'Sucesso' },
  info: { icon: 'ℹ', label: 'Informação' },
  warning: { icon: '⚠', label: 'Atenção' },
};

let lastGlobalToastKey = '';
let lastGlobalToastAt = 0;

function useAlertToast(type, message, showToast, scrollToTop) {
  const { error, success, info } = useFeedback();
  const lastSynced = useRef('');

  useEffect(() => {
    const text = String(message || '').trim();
    if (!text) {
      lastSynced.current = '';
      return;
    }

    const key = `${type}:${text}`;
    if (!showToast || lastSynced.current === key) return;
    lastSynced.current = key;

    const now = Date.now();
    if (lastGlobalToastKey !== key || now - lastGlobalToastAt > 400) {
      lastGlobalToastKey = key;
      lastGlobalToastAt = now;
      if (type === 'error') error(text);
      else if (type === 'success') success(text);
      else if (type === 'info') info(text);
    }

    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [message, type, showToast, scrollToTop, error, success, info]);
}

function AlertContent({ type, children, onDismiss, className }) {
  const meta = ALERT_META[type] || ALERT_META.info;

  return (
    <div
      className={className}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live="assertive"
    >
      <span className="page-alert-icon" aria-hidden="true">{meta.icon}</span>
      <div className="page-alert-content">
        <strong className="page-alert-title">{meta.label}</strong>
        <span className="page-alert-text">{children}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="page-alert-dismiss"
          onClick={onDismiss}
          aria-label="Fechar aviso"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function InlineAlert({
  type = 'error',
  children,
  onDismiss,
  showToast = true,
}) {
  useAlertToast(type, children, showToast, false);
  if (!children) return null;

  return (
    <AlertContent
      type={type}
      onDismiss={onDismiss}
      className={`alert alert-${type} inline-alert`}
    >
      {children}
    </AlertContent>
  );
}

export default function PageAlert({
  type = 'error',
  children,
  onDismiss,
  showToast = false,
  scrollToTop = true,
}) {
  useAlertToast(type, children, showToast, scrollToTop);
  if (!children) return null;

  return (
    <AlertContent
      type={type}
      onDismiss={onDismiss}
      className={`alert alert-${type} page-alert page-alert-${type}`}
    >
      {children}
    </AlertContent>
  );
}
