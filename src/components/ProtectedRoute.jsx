import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import {
  userHasAnyPermission,
  userIsAdministrador,
  canAccessRoute,
  canAccessRouteOfflineForUser,
  getDefaultRoute,
  getDefaultRouteOffline,
} from '../constants/auth';

export default function ProtectedRoute({ permission, permissions, administrador, children }) {
  const { user } = useAuth();
  const { offline } = useOffline();
  const location = useLocation();
  const required = permissions || (permission ? [permission] : null);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (offline) {
    if (!canAccessRouteOfflineForUser(user, location.pathname)) {
      return <Navigate to={getDefaultRouteOffline(user)} replace />;
    }
    return children;
  }

  if (administrador && !userIsAdministrador(user)) {
    return <Navigate to={getDefaultRoute(user)} replace />;
  }

  if (required && !userHasAnyPermission(user, required)) {
    return <Navigate to={getDefaultRoute(user)} replace />;
  }

  if (!required && !canAccessRoute(user, location.pathname)) {
    return <Navigate to={getDefaultRoute(user)} replace />;
  }

  return children;
}
