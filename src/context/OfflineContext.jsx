import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const OfflineContext = createContext(null);

function applyStatus(data) {
  return {
    hybrid: Boolean(data?.hybrid),
    cloud: Boolean(data?.cloud),
    offline: Boolean(data?.offline ?? (data?.hybrid && !data?.cloud)),
    last: data?.last || null,
  };
}

export function OfflineProvider({ children }) {
  const [status, setStatus] = useState({
    hybrid: false,
    cloud: true,
    offline: false,
    last: null,
  });

  const refresh = useCallback(async () => {
    try {
      const data = await api.getSyncStatus();
      setStatus(applyStatus(data));
    } catch {
      setStatus((prev) => ({ ...prev, offline: false }));
    }
  }, []);

  useEffect(() => {
    refresh();

    const onConnectivity = (data) => {
      setStatus((prev) => ({
        ...prev,
        ...applyStatus(data),
        last: prev.last,
      }));
    };

    const onSync = () => {
      refresh();
    };

    if (window.api?.onConnectivityChanged) {
      window.api.onConnectivityChanged(onConnectivity);
    }
    if (window.api?.onSyncCompleted) {
      window.api.onSyncCompleted(onSync);
    }

    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const value = useMemo(() => ({
    ...status,
    refresh,
  }), [status, refresh]);

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline deve ser usado dentro de OfflineProvider');
  }
  return context;
}
