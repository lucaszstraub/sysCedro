import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  SESSION_STORAGE_KEY,
  getDefaultRoute,
  canAccessRoute,
  userHasPermission,
} from '../constants/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
          const { id } = JSON.parse(stored);
          const restored = await api.restoreSession(id);
          setUser(restored);
        }
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (loginValue, senha) => {
    const loggedUser = await api.login(loginValue, senha);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: loggedUser.id }));
    setUser(loggedUser);
    return loggedUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      setUser(null);
    }
  }, []);

  const hasPermission = useCallback(
    (permission) => userHasPermission(user, permission),
    [user]
  );

  const canAccessPath = useCallback(
    (pathname) => {
      if (!user) return false;
      return canAccessRoute(user, pathname);
    },
    [user]
  );

  const defaultRoute = useMemo(() => getDefaultRoute(user), [user]);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    hasPermission,
    canAccessPath,
    defaultRoute,
  }), [user, loading, login, logout, hasPermission, canAccessPath, defaultRoute]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
