import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
  ENTREGA_FILTRO_OPTIONS,
  ENTREGA_KANBAN_COLUNAS,
  SITUACAO_ENTREGA_LABEL,
  TIPO_LIBERACAO_OPTIONS,
  badgeClassSituacaoEntrega,
  resolverColunaEntregaKanban,
} from '../constants/entregas';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import EntregaAgendadaKanbanCard from '../components/EntregaAgendadaKanbanCard';
import NovaAssistenciaEntregaModal from '../components/NovaAssistenciaEntregaModal';
import RegistrarEntregaModal from '../components/RegistrarEntregaModal';
import { formatDate, formatDateTime } from '../utils/format';

function EntregaObservacoesModal({ entrega, onClose, onSave }) {
  const [texto, setTexto] = useState(entrega.observacoes_kanban || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(texto.trim());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Observações — {entrega.numero_pedido || entrega.venda_numero}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}
            <textarea
              rows={4}
              className="form-control"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Anotações visíveis no card do kanban..."
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Entregas() {
  const [aba, setAba] = useState('disponibilidade');
  const [entregas, setEntregas] = useState([]);
  const [agendadas, setAgendadas] = useState([]);
  const [busca, setBusca] = useState('');
  const [buscaKanban, setBuscaKanban] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [loadingKanban, setLoadingKanban] = useState(true);
  const [error, setError] = useState('');
  const [entregaAtiva, setEntregaAtiva] = useState(null);
  const [modalMode, setModalMode] = useState('agendar');
  const [observacoesEntrega, setObservacoesEntrega] = useState(null);
  const [showAssistenciaModal, setShowAssistenciaModal] = useState(false);
  const [statsResumo, setStatsResumo] = useState({ disponivel: 0, parcial: 0, indisponivel: 0 });
  const { success: showSuccess, runWithFeedback } = useFeedback();

  const loadDisponibilidade = async (term = busca, filtroAtual = filtro) => {
    setLoading(true);
    setError('');
    try {
      const [lista, todas] = await Promise.all([
        api.listEntregas(filtroAtual, term),
        filtroAtual === 'todos' ? Promise.resolve(null) : api.listEntregas('todos', term),
      ]);
      setEntregas(lista);
      const base = todas || lista;
      setStatsResumo({
        disponivel: base.filter((e) => e.situacao === 'disponivel').length,
        parcial: base.filter((e) => e.situacao === 'parcial').length,
        indisponivel: base.filter((e) => e.situacao === 'indisponivel').length,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadKanban = async (term = buscaKanban) => {
    setLoadingKanban(true);
    setError('');
    try {
      setAgendadas(await api.listEntregasAgendadas(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingKanban(false);
    }
  };

  const load = async () => {
    await Promise.all([loadDisponibilidade(), loadKanban()]);
  };

  useEffect(() => { load(); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    loadDisponibilidade(busca, filtro);
  };

  const handleSearchKanban = (e) => {
    e.preventDefault();
    loadKanban(buscaKanban);
  };

  const handleFiltroChange = (novoFiltro) => {
    setFiltro(novoFiltro);
    loadDisponibilidade(busca, novoFiltro);
  };

  const abrirEntrega = async (id, mode = 'agendar') => {
    setError('');
    try {
      setModalMode(mode);
      setEntregaAtiva(await api.getEntrega(id));
    } catch (err) {
      setError(err.message);
    }
  };

  const abrirAgendada = async (entrega, mode) => {
    await abrirEntrega(entrega.id, mode);
  };

  const handleAgendar = async (data) => {
    await api.agendarExpedicao(entregaAtiva.venda_id, data);
    setEntregaAtiva(null);
    showSuccess('Entrega agendada com sucesso!');
    await load();
  };

  const handleEditarAgendada = async (data) => {
    await api.updateEntregaKanban(entregaAtiva.id, data);
    setEntregaAtiva(null);
    showSuccess('Agendamento atualizado.');
    await load();
  };

  const handlePreparar = async (data) => {
    const detalhe = await api.updateEntrega(entregaAtiva.id, data);
    setEntregaAtiva(detalhe);
  };

  const handleRegistrar = async (data) => {
    await api.registrarEntrega(entregaAtiva.id, data);
    setEntregaAtiva(null);
    showSuccess('Entrega concluída com sucesso!');
    await load();
  };

  const handlePrint = async (entregaRef = entregaAtiva) => {
    const id = entregaRef?.id || entregaAtiva?.id;
    if (!id) return;
    try {
      await runWithFeedback(
        () => api.gerarPdfEntrega(id),
        {
          loading: 'Gerando ticket de entrega...',
          success: 'Ticket de entrega gerado com sucesso.',
          error: 'Não foi possível gerar o ticket.',
        }
      );
    } catch {
      /* feedback exibido */
    }
  };

  const salvarObservacoes = async (texto) => {
    await api.updateEntregaKanban(observacoesEntrega.id, { observacoes_kanban: texto });
    setObservacoesEntrega(null);
    showSuccess('Observações salvas.');
    await loadKanban();
  };

  const porColunaKanban = useMemo(() => {
    const map = Object.fromEntries(ENTREGA_KANBAN_COLUNAS.map((c) => [c.id, []]));
    agendadas.forEach((e) => {
      const col = resolverColunaEntregaKanban(e);
      if (map[col]) map[col].push(e);
    });
    return map;
  }, [agendadas]);

  const stats = statsResumo;

  return (
    <>
      <header className="page-header">
        <h2>Entregas</h2>
        <p>Disponibilidade dos pedidos e expedições agendadas</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="entregas-tabs">
        <button
          type="button"
          className={`entregas-tab${aba === 'disponibilidade' ? ' is-active' : ''}`}
          onClick={() => setAba('disponibilidade')}
        >
          Disponibilidade
        </button>
        <button
          type="button"
          className={`entregas-tab${aba === 'agendadas' ? ' is-active' : ''}`}
          onClick={() => setAba('agendadas')}
        >
          Entregas agendadas
          {agendadas.filter((e) => e.status === 'agendada').length > 0 && (
            <span className="entregas-tab-badge">
              {agendadas.filter((e) => e.status === 'agendada').length}
            </span>
          )}
        </button>
      </div>

      {aba === 'disponibilidade' && (
        <>
          <div className="stats-grid alocacao-stats">
            <div className={`stat-card ${stats.disponivel > 0 ? 'stat-card-priority' : ''}`}>
              <div className="label">Disponíveis para entrega</div>
              <div className="value">{stats.disponivel}</div>
            </div>
            <div className="stat-card">
              <div className="label">Entrega parcial</div>
              <div className="value">{stats.parcial}</div>
            </div>
            <div className="stat-card">
              <div className="label">Ainda indisponíveis</div>
              <div className="value">{stats.indisponivel}</div>
            </div>
          </div>

          <div className="toolbar">
            <form onSubmit={handleSearch} className="toolbar-filters">
              <input
                className="search-input"
                placeholder="Buscar pedido, cliente ou venda..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <select
                className="filter-select"
                value={filtro}
                onChange={(e) => handleFiltroChange(e.target.value)}
                aria-label="Filtrar entregas"
              >
                {ENTREGA_FILTRO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </form>
            <Link to="/ferramentas-venda/vendas" className="btn btn-secondary">Vendas</Link>
          </div>

          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {loading ? (
                <div className="loading">Carregando entregas...</div>
              ) : entregas.length === 0 ? (
                <div className="empty-state">
                  {busca.trim() || filtro !== 'todos'
                    ? 'Nenhuma entrega encontrada para esta busca.'
                    : 'Nenhuma entrega cadastrada. As entregas são criadas automaticamente ao salvar uma venda.'}
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Situação</th>
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>Venda</th>
                      <th>Tipo</th>
                      <th>Progresso</th>
                      <th>Disponível agora</th>
                      <th>Última entrega</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {entregas.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <span className={`badge ${badgeClassSituacaoEntrega(e.situacao)}`}>
                            {SITUACAO_ENTREGA_LABEL[e.situacao] || e.situacao}
                          </span>
                        </td>
                        <td><strong>{e.numero_pedido || '—'}</strong></td>
                        <td>{e.cliente_nome}</td>
                        <td>{e.venda_numero}</td>
                        <td>
                          {TIPO_LIBERACAO_OPTIONS.find((t) => t.value === e.tipo_liberacao)?.label.split(' — ')[0]
                            || e.tipo_liberacao}
                        </td>
                        <td>{e.total_entregue}/{e.total_itens}</td>
                        <td>{e.total_disponivel}</td>
                        <td>{e.data_realizada ? formatDateTime(e.data_realizada) : '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => abrirEntrega(e.id, 'agendar')}
                          >
                            Agendar entrega
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {aba === 'agendadas' && (
        <>
          <div className="toolbar">
            <form onSubmit={handleSearchKanban} className="toolbar-filters">
              <input
                className="search-input"
                placeholder="Buscar no kanban..."
                value={buscaKanban}
                onChange={(e) => setBuscaKanban(e.target.value)}
              />
            </form>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAssistenciaModal(true)}
            >
              + Assistência técnica
            </button>
          </div>

          {loadingKanban ? (
            <div className="loading">Carregando entregas agendadas...</div>
          ) : (
            <div className="kanban-board kanban-board-2">
              {ENTREGA_KANBAN_COLUNAS.map((coluna) => (
                <section key={coluna.id} className="kanban-column">
                  <header className="kanban-column-header">
                    <h3>{coluna.title}</h3>
                    <span className="kanban-column-count">{porColunaKanban[coluna.id]?.length || 0}</span>
                  </header>
                  <div className="kanban-column-body">
                    {(porColunaKanban[coluna.id] || []).length === 0 ? (
                      <p className="kanban-column-empty">Nenhum card nesta coluna.</p>
                    ) : (
                      porColunaKanban[coluna.id].map((entrega) => (
                        <EntregaAgendadaKanbanCard
                          key={entrega.id}
                          entrega={entrega}
                          onEditar={(e) => abrirAgendada(e, 'editar')}
                          onConcluir={(e) => abrirAgendada(e, 'concluir')}
                          onImprimir={handlePrint}
                          onObservacoes={setObservacoesEntrega}
                        />
                      ))
                    )}
                  </div>
                  <p className="hint-text kanban-column-hint">{coluna.hint}</p>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {entregaAtiva && (
        <RegistrarEntregaModal
          entrega={entregaAtiva}
          mode={modalMode}
          onClose={() => setEntregaAtiva(null)}
          onAgendar={handleAgendar}
          onConfirm={modalMode === 'editar' ? handleEditarAgendada : handleRegistrar}
          onPrepare={handlePreparar}
          onPrint={() => handlePrint()}
        />
      )}

      {observacoesEntrega && (
        <EntregaObservacoesModal
          entrega={observacoesEntrega}
          onClose={() => setObservacoesEntrega(null)}
          onSave={salvarObservacoes}
        />
      )}

      {showAssistenciaModal && (
        <NovaAssistenciaEntregaModal
          onClose={() => setShowAssistenciaModal(false)}
          onCreated={() => {
            setShowAssistenciaModal(false);
            showSuccess('Assistência técnica agendada.');
            loadKanban();
            setAba('agendadas');
          }}
        />
      )}
    </>
  );
}
