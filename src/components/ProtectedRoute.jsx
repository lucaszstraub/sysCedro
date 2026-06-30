import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userHasAnyPermission, userIsAdministrador } from '../constants/auth';

export default function ProtectedRoute({ permission, permissions, administrador, children }) {
  const { user, hasPermission, canAccessPath, defaultRoute } = useAuth();
  const required = permissions || (permission ? [permission] : null);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (administrador && !userIsAdministrador(user)) {
    return <Navigate to={defaultRoute} replace />;
  }

  if (required && !userHasAnyPermission(user, required)) {
    return <Navigate to={defaultRoute} replace />;
  }

  if (!required) {
    const path = window.location.hash.replace(/^#/, '') || '/';
    if (!canAccessPath(path)) {
      return <Navigate to={defaultRoute} replace />;
    }
  }

  return children;
}
