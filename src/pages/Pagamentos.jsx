import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ESTOQUE_BASE } from '../constants/auth';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import CentroCustoModal from '../components/CentroCustoModal';
import PagamentoFinanceiroModal from '../components/PagamentoFinanceiroModal';
import { formatCurrency, formatDate } from '../utils/format';

const MESES = [
  { value: '', label: 'Todos os meses' },
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

export default function Pagamentos() {
  const agora = new Date();
  const [busca, setBusca] = useState('');
  const [ano, setAno] = useState(String(agora.getFullYear()));
  const [mes, setMes] = useState(String(agora.getMonth() + 1));
  const [centroFiltro, setCentroFiltro] = useState('');
  const [pagamentos, setPagamentos] = useState([]);
  const [totalPagamentos, setTotalPagamentos] = useState(0);
  const [centrosCusto, setCentrosCusto] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPagamentoModal, setShowPagamentoModal] = useState(false);
  const [showCentroModal, setShowCentroModal] = useState(false);
  const [editandoPagamento, setEditandoPagamento] = useState(null);
  const [deletingPagamentoId, setDeletingPagamentoId] = useState(null);
  const [reopenPagamentoModal, setReopenPagamentoModal] = useState(false);
  const { confirm, success: showSuccess } = useFeedback();

  const anosDisponiveis = useMemo(() => {
    const atual = agora.getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(atual - i));
  }, []);

  const loadCentros = async (term = '') => {
    const lista = await api.listCentrosCusto(term, { incluirInativos: true });
    setCentrosCusto(lista);
    return lista;
  };

  const loadPagamentos = async () => {
    const resultado = await api.listPagamentosFinanceiros({
      busca,
      ano: ano || null,
      mes: mes || null,
      centro_custo_id: centroFiltro || null,
    });
    setPagamentos(resultado.itens || []);
    setTotalPagamentos(resultado.total || 0);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await loadCentros();
      await loadPagamentos();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const aplicarFiltros = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    try {
      await loadPagamentos();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePagamento = async (data) => {
    if (editandoPagamento) {
      await api.updatePagamentoFinanceiro(editandoPagamento.id, data);
      showSuccess('Pagamento atualizado.');
    } else {
      await api.createPagamentoFinanceiro(data);
      showSuccess('Pagamento cadastrado.');
    }
    setShowPagamentoModal(false);
    setEditandoPagamento(null);
    await load();
  };

  const handleSaveCentro = async (data) => {
    await api.createCentroCusto(data);
    showSuccess(`Centro de custo ${data.nome} cadastrado.`);
    setShowCentroModal(false);
    await loadCentros();
    if (reopenPagamentoModal) {
      setReopenPagamentoModal(false);
      setShowPagamentoModal(true);
    }
  };

  const handleDeletePagamento = async (pagamento) => {
    const ok = await confirm({
      title: 'Excluir pagamento',
      message: `Deseja excluir o pagamento "${pagamento.descricao}"?`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingPagamentoId(pagamento.id);
    setError('');
    try {
      await api.deletePagamentoFinanceiro(pagamento.id);
      showSuccess('Pagamento excluído.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingPagamentoId(null);
    }
  };

  const abrirNovoPagamento = () => {
    setEditandoPagamento(null);
    setShowPagamentoModal(true);
  };

  return (
    <>
      <header className="page-header">
        <h2>Pagamentos</h2>
        <p>
          Lançamentos de despesas por centro de custo — base para futura DRE mensal.
          {' '}
          <Link to={`${ESTOQUE_BASE}/centros-custo`}>Gerenciar centros de custo</Link>
        </p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
            <form onSubmit={aplicarFiltros} className="toolbar-filters">
              <input
                className="search-input"
                placeholder="Buscar por descrição ou centro de custo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <select
                className="filter-select"
                value={ano}
                onChange={(e) => setAno(e.target.value)}
                aria-label="Ano"
              >
                <option value="">Todos os anos</option>
                {anosDisponiveis.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <select
                className="filter-select"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                aria-label="Mês"
              >
                {MESES.map((item) => (
                  <option key={item.value || 'todos'} value={item.value}>{item.label}</option>
                ))}
              </select>
              <select
                className="filter-select"
                value={centroFiltro}
                onChange={(e) => setCentroFiltro(e.target.value)}
                aria-label="Centro de custo"
              >
                <option value="">Todos os centros</option>
                {centrosCusto.filter((c) => c.ativo !== false).map((centro) => (
                  <option key={centro.id} value={centro.id}>{centro.nome}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">Filtrar</button>
            </form>
            <button type="button" className="btn btn-primary" onClick={abrirNovoPagamento}>
              + Novo pagamento
            </button>
          </div>

          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {loading ? (
                <div className="loading">Carregando pagamentos...</div>
              ) : pagamentos.length === 0 ? (
                <div className="empty-state">
                  Nenhum pagamento encontrado para os filtros selecionados.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Centro de custo</th>
                      <th>Origem</th>
                      <th>Valor</th>
                      <th>Observações</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentos.map((pagamento) => (
                      <tr key={pagamento.id}>
                        <td>{formatDate(pagamento.data_pagamento)}</td>
                        <td><strong>{pagamento.descricao}</strong></td>
                        <td>{pagamento.centro_custo_nome}</td>
                        <td className="hint-text">
                          {pagamento.nota_fiscal_numero
                            ? `NF ${pagamento.nota_fiscal_numero}${pagamento.nota_fiscal_parcela ? ` · Boleto ${pagamento.nota_fiscal_parcela}` : ''}`
                            : 'Manual'}
                        </td>
                        <td>{formatCurrency(pagamento.valor)}</td>
                        <td className="hint-text">{pagamento.observacoes || '—'}</td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditandoPagamento(pagamento);
                              setShowPagamentoModal(true);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeletePagamento(pagamento)}
                            disabled={deletingPagamentoId === pagamento.id}
                          >
                            {deletingPagamentoId === pagamento.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}><strong>Total do período</strong></td>
                      <td colSpan={3}><strong>{formatCurrency(totalPagamentos)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>

      {showPagamentoModal && (
        <PagamentoFinanceiroModal
          key={editandoPagamento?.id ?? 'novo'}
          pagamento={editandoPagamento}
          centrosCusto={centrosCusto}
          onClose={() => {
            setShowPagamentoModal(false);
            setEditandoPagamento(null);
          }}
          onSave={handleSavePagamento}
          onNovoCentroCusto={() => {
            setReopenPagamentoModal(true);
            setShowPagamentoModal(false);
            setShowCentroModal(true);
          }}
        />
      )}

      {showCentroModal && (
        <CentroCustoModal
          centro={null}
          onClose={() => {
            setShowCentroModal(false);
            if (reopenPagamentoModal) {
              setReopenPagamentoModal(false);
              setShowPagamentoModal(true);
            }
          }}
          onSave={handleSaveCentro}
        />
      )}
    </>
  );
}
