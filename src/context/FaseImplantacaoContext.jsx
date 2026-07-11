import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const FaseImplantacaoContext = createContext({
  ativa: false,
  loading: true,
  refresh: async () => {},
  setAtiva: async () => {},
  backfillPedidos: async () => {},
});

export function FaseImplantacaoProvider({ children }) {
  const { user } = useAuth();
  const [ativa, setAtivaState] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setAtivaState(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getFaseImplantacao();
      setAtivaState(Boolean(data?.ativa));
    } catch {
      setAtivaState(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setAtiva = useCallback(async (valor) => {
    const data = await api.setFaseImplantacao(valor);
    setAtivaState(Boolean(data?.ativa));
    return data;
  }, []);

  const backfillPedidos = useCallback(async () => api.backfillExpedicoesImplantacao(), []);

  const value = useMemo(() => ({
    ativa,
    loading,
    refresh,
    setAtiva,
    backfillPedidos,
  }), [ativa, loading, refresh, setAtiva, backfillPedidos]);

  return (
    <FaseImplantacaoContext.Provider value={value}>
      {children}
    </FaseImplantacaoContext.Provider>
  );
}

export function useFaseImplantacao() {
  return useContext(FaseImplantacaoContext);
}
