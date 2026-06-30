import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { ACOMPANHAMENTO_ETAPAS, FILTRO_ETAPA_PADRAO, FILTROS_ETAPA_KANBAN, resolverEtapasFiltro, resolverEtapaKanban } from '../constants/acompanhamentoPedidoPlanejado';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import AcompanhamentoPedidoKanbanCard from '../components/AcompanhamentoPedidoKanbanCard';
import AcompanhamentoPedidoObservacoesModal from '../components/AcompanhamentoPedidoObservacoesModal';
import NovaAssistenciaTecnicaModal from '../components/NovaAssistenciaTecnicaModal';

const REFRESH_INTERVAL_MS = 60_000;

export default function AcompanhamentoPedidosPlanejados() {
  const [pedidos, setPedidos] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState(FILTRO_ETAPA_PADRAO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAssistenciaModal, setShowAssistenciaModal] = useState(false);
  const [pedidoObservacoes, setPedidoObservacoes] = useState(null);
  const { success: showSuccess } = useFeedback();

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      setPedidos(await api.listAcompanhamentoPedidosPlanejados(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const timer = setInterval(() => load(busca), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [busca]);

  const etapasVisiveis = useMemo(
    () => resolverEtapasFiltro(filtroEtapa),
    [filtroEtapa]
  );

  const colunasKanban = useMemo(
    () => ACOMPANHAMENTO_ETAPAS.filter((c) => etapasVisiveis.includes(c.id)),
    [etapasVisiveis]
  );

  const pedidosFiltrados = useMemo(
    () => pedidos.filter((p) => etapasVisiveis.includes(resolverEtapaKanban(p))),
    [pedidos, etapasVisiveis]
  );

  const porColuna = useMemo(() => {
    const map = Object.fromEntries(ACOMPANHAMENTO_ETAPAS.map((c) => [c.id, []]));
    pedidosFiltrados.forEach((p) => {
      const etapa = resolverEtapaKanban(p);
      if (map[etapa]) map[etapa].push(p);
    });
    return map;
  }, [pedidosFiltrados]);

  const boardClass = colunasKanban.length >= 5
    ? 'kanban-board kanban-board-5'
    : `kanban-board kanban-board-${colunasKanban.length}`;

  const handleDragStart = (e, pedido) => {
    e.dataTransfer.setData('text/plain', String(pedido.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const moverParaEtapa = async (pedidoId, etapaId) => {
    const pedido = pedidos.find((p) => p.id === Number(pedidoId));
    if (!pedido || resolverEtapaKanban(pedido) === etapaId) return;

    const coluna = ACOMPANHAMENTO_ETAPAS.find((c) => c.id === etapaId);
    if (!coluna?.aceitaDrop) return;

    try {
      await api.moverAcompanhamentoPedidoKanban(pedido.id, { etapa: etapaId });
      const label = pedido.tipo === 'assistencia' ? pedido.numero : pedido.venda_numero;
      showSuccess(`${label} movido para ${coluna.title}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDrop = (e, coluna) => {
    if (!coluna.aceitaDrop) return;
    e.preventDefault();
    e.stopPropagation();
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id) return;
    moverParaEtapa(id, coluna.id);
  };

  const handleMontagemConcluida = (pedido) => {
    moverParaEtapa(pedido.id, 'finalizado');
  };

  const handleAssistenciaCreated = async () => {
    showSuccess('Assistência técnica registrada no acompanhamento.');
    await load();
  };

  return (
    <>
      <header className="page-header">
        <h2>Acompanhamento de pedidos</h2>
        <p>Fluxo pós-venda: fábrica, depósito, montagem e finalização — inclui assistências técnicas</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }} className="toolbar-filters">
          <input
            className="search-input"
            placeholder="Buscar por número, pedido, cliente ou assistência..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select
            className="filter-select"
            value={filtroEtapa}
            onChange={(e) => setFiltroEtapa(e.target.value)}
            aria-label="Filtrar por estágio"
          >
            {FILTROS_ETAPA_KANBAN.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </form>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setShowAssistenciaModal(true)}
        >
          + Assistência técnica
        </button>
      </div>

      {loading ? (
        <div className="loading">Carregando quadro...</div>
      ) : colunasKanban.length === 0 ? (
        <div className="empty-state">Nenhum estágio selecionado no filtro.</div>
      ) : (
        <div className={boardClass}>
          {colunasKanban.map((coluna) => (
            <section
              key={coluna.id}
              className={`kanban-column ${coluna.id === 'montagem' ? 'kanban-column-highlight' : ''} ${coluna.muted ? 'kanban-column-muted' : ''}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, coluna)}
            >
              <header className="kanban-column-header">
                <h3>{coluna.title}</h3>
                <span className="kanban-column-count">{porColuna[coluna.id]?.length || 0}</span>
              </header>
              <div
                className="kanban-column-body"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, coluna)}
              >
                {(porColuna[coluna.id] || []).length === 0 ? (
                  <div
                    className="kanban-column-empty"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, coluna)}
                  >
                    Arraste cards para cá
                  </div>
                ) : (
                  porColuna[coluna.id].map((p) => (
                    <AcompanhamentoPedidoKanbanCard
                      key={p.id}
                      pedido={p}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, coluna)}
                      onOpenObservacoes={setPedidoObservacoes}
                      onMontagemConcluida={handleMontagemConcluida}
                    />
                  ))
                )}
              </div>
              {coluna.hint && (
                <p className="hint-text kanban-column-hint">{coluna.hint}</p>
              )}
            </section>
          ))}
        </div>
      )}

      {showAssistenciaModal && (
        <NovaAssistenciaTecnicaModal
          onClose={() => setShowAssistenciaModal(false)}
          onCreated={handleAssistenciaCreated}
        />
      )}

      {pedidoObservacoes && (
        <AcompanhamentoPedidoObservacoesModal
          pedido={pedidoObservacoes}
          onClose={() => setPedidoObservacoes(null)}
          onUpdated={() => load()}
        />
      )}
    </>
  );
}
