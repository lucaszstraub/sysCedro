import { useCallback, useState } from 'react';
import { useFeedback } from '../context/FeedbackContext';

/**
 * Padroniza erro/sucesso em formulários: estado inline (PageAlert) + toast visível.
 */
export function useFormFeedback() {
  const feedback = useFeedback();
  const [formError, setFormErrorState] = useState('');

  const clearFormError = useCallback(() => {
    setFormErrorState('');
  }, []);

  const setFormError = useCallback((message) => {
    const msg = String(message || '').trim();
    if (!msg) {
      clearFormError();
      return;
    }
    setFormErrorState(msg);
    feedback.error(msg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [clearFormError, feedback]);

  const notifySuccess = useCallback((message, duration) => {
    clearFormError();
    feedback.success(message, duration);
  }, [clearFormError, feedback]);

  const notifyInfo = useCallback((message, duration) => {
    feedback.info(message, duration);
  }, [feedback]);

  return {
    formError,
    setFormError,
    clearFormError,
    notifySuccess,
    notifyInfo,
    ...feedback,
  };
}
