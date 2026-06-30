import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFeedback } from '../context/FeedbackContext';

export function useRouteFeedback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { success, error, info } = useFeedback();

  useEffect(() => {
    const feedback = location.state?.feedback;
    if (!feedback?.message) return;

    if (feedback.type === 'error') error(feedback.message);
    else if (feedback.type === 'info') info(feedback.message);
    else success(feedback.message);

    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate, success, error, info]);
}
