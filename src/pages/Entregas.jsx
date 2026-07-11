import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useFaseImplantacao } from '../context/FaseImplantacaoContext';
import {
  ENTREGA_FILTRO_OPTIONS,
  ENTREGA_KANBAN_COLUNAS,
  ENTREGA_KANBAN_FILTROS,
  SITUACAO_ENTREGA_HINT,
  SITUACAO_ENTREGA_LABEL,
  TIPO_LIBERACAO_OPTIONS,
  badgeClassSituacaoEntrega,
  formatarResumoExpedicoes,
  labelPeriodoEntrega,
  podeAgendarEntrega,
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

function filtrarKanban(entregas, filtro) {
  if (filtro === 'pendente') {
    return entregas.filter((e) => e.status === 'agendada' && e.confirmacao_cliente === 'pendente');
  }
  if (filtro === 'urgencia') return entregas.filter((e) => e.flag_urgencia);
  if (filtro === 'assistencia') {
    return entregas.filter((e) => e.tipo === 'assistencia' || e.flag_assistencia_tecnica);
  }
  return entregas;
}

export default function Entregas() {
  const [aba, setAba] = useState('disponibilidade');
  const [entregas, setEntregas] = useState([]);
  const [agendadas, setAgendadas] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [filtroKanban, setFiltroKanban] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [loadingKanban, setLoadingKanban] = useState(true);
  const [error, setError] = useState('');
  const [entregaAtiva, setEntregaAtiva] = useState(null);
  const [modalMode, setModalMode] = useState('agendar');
  const [observacoesEntrega, setObservacoesEntrega] = useState(null);
  const [showAssistenciaModal, setShowAssistenciaModal] = useState(false);
  const [statsResumo, setStatsResumo] = useState({ disponivel: 0, parcial: 0, indisponivel: 0 });
  const { success: showSuccess, runWithFeedback } = useFeedback();
  const { ativa: faseImplantacaoAtiva } = useFaseImplantacao();

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

  const loadKanban = async (term = busca) => {
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
    loadKanban(busca);
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

  const irParaExpedicoes = (termo = '') => {
    if (termo) setBusca(termo);
    setAba('agendadas');
    loadKanban(termo || busca);
  };

  const handleAgendar = async (data) => {
    await api.agendarExpedicao(entregaAtiva.venda_id, data);
    const pedido = entregaAtiva.numero_pedido || entregaAtiva.venda_numero;
    setEntregaAtiva(null);
    showSuccess(`Expedição agendada para o pedido ${pedido}. Confirme com o cliente na aba Expedições.`);
    await load();
    setAba('agendadas');
  };

  const handleEditarAgendada = async (data) => {
    await api.updateEntregaKanban(entregaAtiva.id, data);
    setEntregaAtiva(null);
    showSuccess('Expedição atualizada.');
    await load();
  };

  const handleConfirmarAgendamentoCliente = async (entregaRef = entregaAtiva) => {
    const id = entregaRef?.id;
    if (!id) return;
    try {
      await api.confirmarAgendamentoCliente(id);
      if (entregaAtiva?.id === id) {
        setEntregaAtiva(await api.getEntrega(id));
      }
      showSuccess('Cliente confirmou a data da expedição.');
      await loadKanban();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePreparar = async (data) => {
    const detalhe = await api.updateEntrega(entregaAtiva.id, data);
    setEntregaAtiva(detalhe);
  };

  const handleRegistrar = async (data) => {
    await api.registrarEntrega(entregaAtiva.id, data);
    setEntregaAtiva(null);
    showSuccess('Entrega registrada. O estoque foi atualizado.');
    await load();
  };

  const handleMarcarJaRealizada = async (entrega) => {
    const pedido = entrega.numero_pedido || entrega.venda_numero;
    if (!window.confirm(
      `Marcar o pedido ${pedido} como entrega já realizada?\n\nNenhuma data será registrada e o estoque não será alterado novamente.`
    )) {
      return;
    }
    try {
      await api.marcarEntregaJaRealizada(entrega.id);
      showSuccess(`Pedido ${pedido} movido para entregas finalizadas.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
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

  const agendadasFiltradas = useMemo(
    () => filtrarKanban(agendadas, filtroKanban),
    [agendadas, filtroKanban]
  );

  const porColunaKanban = useMemo(() => {
    const map = Object.fromEntries(ENTREGA_KANBAN_COLUNAS.map((c) => [c.id, []]));
    agendadasFiltradas.forEach((e) => {
      const col = resolverColunaEntregaKanban(e);
      if (map[col]) map[col].push(e);
    });
    return map;
  }, [agendadasFiltradas]);

  const stats = statsResumo;
  const expedicoesNaFila = agendadas.filter((e) => e.status === 'agendada').length;
  const aguardandoCliente = agendadas.filter(
    (e) => e.status === 'agendada' && e.confirmacao_cliente === 'pendente'
  ).length;

  const renderAcaoPedido = (e) => {
    if (e.situacao === 'entregue') {
      return (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => irParaExpedicoes(e.numero_pedido || e.venda_numero)}
        >
          Ver expedições
        </button>
      );
    }
    if (!podeAgendarEntrega(e)) {
      return (
        <button type="button" className="btn btn-secondary btn-sm" disabled title={SITUACAO_ENTREGA_HINT.indisponivel}>
          Aguardando estoque
        </button>
      );
    }
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => abrirEntrega(e.id, 'agendar')}
      >
        Agendar expedição
      </button>
    );
  };

  return (
    <>
      <header className="page-header">
        <h2>Entregas</h2>
        <p>Gerencie a disponibilidade dos pedidos e as expedições agendadas</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="entregas-fluxo-guia card">
        <div className="entregas-fluxo-passos">
          <div className="entregas-fluxo-passo">
            <span className="entregas-fluxo-num">1</span>
            <div>
              <strong>Pedidos</strong>
              <p>Verifique quais itens estão disponíveis em estoque ou já recebidos da encomenda.</p>
            </div>
          </div>
          <div className="entregas-fluxo-passo">
            <span className="entregas-fluxo-num">2</span>
            <div>
              <strong>Expedição</strong>
              <p>Agende data e turno, confirme com o cliente e registre a entrega física.</p>
            </div>
          </div>
          <div className="entregas-fluxo-passo">
            <span className="entregas-fluxo-num">3</span>
            <div>
              <strong>Estoque</strong>
              <p>Ao concluir a entrega, o sistema baixa automaticamente o estoque reservado.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="entregas-tabs" role="tablist" aria-label="Seções de entregas">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'disponibilidade'}
          className={`entregas-tab${aba === 'disponibilidade' ? ' is-active' : ''}`}
          onClick={() => setAba('disponibilidade')}
        >
          <span className="entregas-tab-label">Pedidos</span>
          <span className="entregas-tab-desc">Disponibilidade</span>
          {stats.disponivel > 0 && (
            <span className="entregas-tab-badge">{stats.disponivel}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'agendadas'}
          className={`entregas-tab${aba === 'agendadas' ? ' is-active' : ''}`}
          onClick={() => setAba('agendadas')}
        >
          <span className="entregas-tab-label">Expedições</span>
          <span className="entregas-tab-desc">Agendadas e entregues</span>
          {expedicoesNaFila > 0 && (
            <span className="entregas-tab-badge">{expedicoesNaFila}</span>
          )}
          {aguardandoCliente > 0 && (
            <span className="entregas-tab-badge entregas-tab-badge--alert" title="Aguardando confirmação do cliente">
              {aguardandoCliente}
            </span>
          )}
        </button>
      </div>

      {aba === 'disponibilidade' && (
        <>
          <div className="stats-grid alocacao-stats">
            <button
              type="button"
              className={`stat-card stat-card-clickable ${stats.disponivel > 0 ? 'stat-card-priority' : ''}${filtro === 'disponivel' ? ' is-active' : ''}`}
              onClick={() => handleFiltroChange('disponivel')}
            >
              <div className="label">Prontos para agendar</div>
              <div className="value">{stats.disponivel}</div>
              <div className="hint-text">Pedidos com itens liberados</div>
            </button>
            <button
              type="button"
              className={`stat-card stat-card-clickable${filtro === 'parcial' ? ' is-active' : ''}`}
              onClick={() => handleFiltroChange('parcial')}
            >
              <div className="label">Em andamento</div>
              <div className="value">{stats.parcial}</div>
              <div className="hint-text">Entrega parcial já iniciada</div>
            </button>
            <button
              type="button"
              className={`stat-card stat-card-clickable${filtro === 'indisponivel' ? ' is-active' : ''}`}
              onClick={() => handleFiltroChange('indisponivel')}
            >
              <div className="label">Aguardando estoque</div>
              <div className="value">{stats.indisponivel}</div>
              <div className="hint-text">Encomenda ou reserva pendente</div>
            </button>
          </div>

          {stats.disponivel > 0 && filtro === 'todos' && (
            <div className="alert alert-info entregas-alerta-prioridade">
              <strong>{stats.disponivel} pedido{stats.disponivel > 1 ? 's' : ''} pronto{stats.disponivel > 1 ? 's' : ''} para agendar.</strong>
              {' '}Após agendar, acompanhe na aba <button type="button" className="btn btn-link btn-sm" onClick={() => setAba('agendadas')}>Expedições</button>.
            </div>
          )}

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
                aria-label="Filtrar pedidos"
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
                <div className="loading">Carregando pedidos...</div>
              ) : entregas.length === 0 ? (
                <div className="empty-state">
                  {busca.trim() || filtro !== 'todos'
                    ? 'Nenhum pedido encontrado para esta busca.'
                    : 'Nenhum pedido com entrega. Os registros são criados automaticamente ao confirmar uma venda.'}
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Situação</th>
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>Liberação</th>
                      <th title="Unidades já entregues / total de unidades do pedido">Itens entregues</th>
                      <th title="Unidades disponíveis para agendar agora">Unid. disponíveis</th>
                      <th>Expedições</th>
                      <th>Última entrega</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {entregas.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <span
                            className={`badge ${badgeClassSituacaoEntrega(e.situacao)}`}
                            title={SITUACAO_ENTREGA_HINT[e.situacao]}
                          >
                            {SITUACAO_ENTREGA_LABEL[e.situacao] || e.situacao}
                          </span>
                        </td>
                        <td><strong>{e.numero_pedido || '—'}</strong></td>
                        <td>{e.cliente_nome}</td>
                        <td title={TIPO_LIBERACAO_OPTIONS.find((t) => t.value === e.tipo_liberacao)?.label}>
                          {e.tipo_liberacao === 'completa' ? 'Completa' : 'Parcial'}
                        </td>
                        <td>{e.total_entregue}/{e.total_itens}</td>
                        <td>
                          <strong className={e.total_disponivel > 0 ? 'text-success' : ''}>
                            {e.total_disponivel}
                          </strong>
                        </td>
                        <td className="entregas-col-expedicoes">
                          {formatarResumoExpedicoes(e.expedicoes, formatDate)}
                          {e.expedicoes?.proxima_data && e.expedicoes?.proximo_periodo && (
                            <span className="hint-text">
                              {labelPeriodoEntrega(e.expedicoes.proximo_periodo)}
                            </span>
                          )}
                        </td>
                        <td>{e.data_realizada ? formatDateTime(e.data_realizada) : '—'}</td>
                        <td>{renderAcaoPedido(e)}</td>
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
            <form onSubmit={handleSearch} className="toolbar-filters">
              <input
                className="search-input"
                placeholder="Buscar expedição, pedido ou cliente..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <div className="entregas-kanban-filtros" role="group" aria-label="Filtrar expedições">
                {ENTREGA_KANBAN_FILTROS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`btn btn-sm ${filtroKanban === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setFiltroKanban(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </form>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAssistenciaModal(true)}
            >
              + Assistência técnica
            </button>
          </div>

          {aguardandoCliente > 0 && filtroKanban === 'todos' && (
            <div className="alert alert-warning entregas-alerta-prioridade">
              <strong>{aguardandoCliente} expedição(ões) aguardando confirmação do cliente.</strong>
              {' '}Envie a mensagem pelo WhatsApp e marque como confirmada após a resposta.
            </div>
          )}

          {loadingKanban ? (
            <div className="loading">Carregando expedições...</div>
          ) : (
            <div className="kanban-board kanban-board-2">
              {ENTREGA_KANBAN_COLUNAS.map((coluna) => (
                <section
                  key={coluna.id}
                  className={`kanban-column${coluna.highlight ? ' kanban-column-highlight' : ''}${coluna.muted ? ' kanban-column-muted' : ''}`}
                >
                  <header className="kanban-column-header">
                    <h3>{coluna.title}</h3>
                    <span className="kanban-column-count">{porColunaKanban[coluna.id]?.length || 0}</span>
                  </header>
                  <div className="kanban-column-body">
                    {(porColunaKanban[coluna.id] || []).length === 0 ? (
                      <p className="kanban-column-empty">Nenhuma expedição nesta coluna.</p>
                    ) : (
                      porColunaKanban[coluna.id].map((entrega) => (
                        <EntregaAgendadaKanbanCard
                          key={entrega.id}
                          entrega={entrega}
                          faseImplantacaoAtiva={faseImplantacaoAtiva}
                          onEditar={(e) => abrirAgendada(e, 'editar')}
                          onConcluir={(e) => abrirAgendada(e, 'concluir')}
                          onMarcarJaRealizada={handleMarcarJaRealizada}
                          onImprimir={handlePrint}
                          onObservacoes={setObservacoesEntrega}
                          onConfirmarCliente={handleConfirmarAgendamentoCliente}
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
          onConfirmarCliente={
            modalMode === 'editar' ? () => handleConfirmarAgendamentoCliente(entregaAtiva) : undefined
          }
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
