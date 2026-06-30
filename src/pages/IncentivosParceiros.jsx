import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import { formatCurrency, formatDate } from '../utils/format';
import PageAlert from '../components/PageAlert';
import IncentivoParceiroModal from '../components/IncentivoParceiroModal';

function StatusBadge({ status }) {
  if (status === 'pago') {
    return <span className="badge badge-recebido">Pago</span>;
  }
  return <span className="badge badge-a-receber">A pagar</span>;
}

export default function IncentivosParceiros() {
  const [dados, setDados] = useState({ resumo: null, incentivos: [] });
  const [parceiros, setParceiros] = useState([]);
  const [busca, setBusca] = useState('');
  const [parceiroId, setParceiroId] = useState('');
  const [statusPagamento, setStatusPagamento] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalMode, setModalMode] = useState(null);
  const [editando, setEditando] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const { confirm, success: showSuccess } = useFeedback();

  const filtros = {
    busca,
    parceiroId: parceiroId || null,
    statusPagamento: statusPagamento || null,
  };

  const load = async (nextFiltros = filtros) => {
    setLoading(true);
    setError('');
    try {
      setDados(await api.listIncentivosParceiro(nextFiltros));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setParceiros(await api.listParceiros(''));
      } catch (err) {
        setError(err.message);
      }
    })();
    load();
  }, []);

  const abrirNovo = () => {
    setModalMode('create');
    setEditando(null);
  };

  const abrirEdicao = async (incentivo) => {
    setModalMode('edit');
    setModalLoading(true);
    setError('');
    try {
      const completo = await api.getIncentivoParceiro(incentivo.venda_id);
      setEditando(completo);
    } catch (err) {
      setError(err.message);
      setModalMode(null);
    } finally {
      setModalLoading(false);
    }
  };

  const fecharModal = () => {
    setModalMode(null);
    setEditando(null);
  };

  const handleSave = async (data) => {
    const salvo = await api.saveIncentivoParceiro(data);
    const statusLabel = salvo.status_pagamento === 'pago' ? 'pago' : 'a pagar';
    showSuccess(`Incentivo de ${formatCurrency(salvo.valor_comissao)} registrado (${statusLabel}).`);
    fecharModal();
    await load();
  };

  const handleRemove = async (vendaId) => {
    const ok = await confirm({
      title: 'Excluir incentivo',
      message: 'Deseja excluir este registro de incentivo?',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    await api.deleteIncentivoParceiro(vendaId);
    showSuccess('Incentivo excluído.');
    fecharModal();
    await load();
  };

  const resumo = dados.resumo;
  const incentivos = dados.incentivos || [];

  return (
    <>
      <header className="page-header incentivo-page-header">
        <div>
          <h2>Incentivos a Parceiros</h2>
          <p>
            Controle interno de bonificações — cadastre, acompanhe pagamentos e vincule a pedidos já lançados.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNovo}>
          + Cadastrar incentivo
        </button>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {resumo && (
        <div className="stats-grid incentivo-stats">
          <div className="stat-card stat-card-priority">
            <div className="label">A pagar</div>
            <div className="value">{formatCurrency(resumo.total_a_pagar)}</div>
            <div className="hint-text">{resumo.qtd_a_pagar} incentivo(s)</div>
          </div>
          <div className="stat-card">
            <div className="label">Pagos</div>
            <div className="value">{formatCurrency(resumo.total_pago)}</div>
            <div className="hint-text">{resumo.qtd_pago} incentivo(s)</div>
          </div>
          <div className="stat-card">
            <div className="label">Total registrado</div>
            <div className="value">{formatCurrency(resumo.total_a_pagar + resumo.total_pago)}</div>
            <div className="hint-text">{resumo.qtd_a_pagar + resumo.qtd_pago} registro(s)</div>
          </div>
        </div>
      )}

      <div className="card incentivo-filtros-card">
        <div className="card-body">
          <form
            className="incentivos-filtros"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <input
              className="search-input"
              placeholder="Buscar pedido, cliente, vendedor ou parceiro..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select
              className="form-control"
              value={parceiroId}
              onChange={(e) => setParceiroId(e.target.value)}
              aria-label="Filtrar por parceiro"
            >
              <option value="">Todos os parceiros</option>
              {parceiros.map((parceiro) => (
                <option key={parceiro.id} value={parceiro.id}>
                  {parceiro.nome_completo}
                </option>
              ))}
            </select>
            <select
              className="form-control"
              value={statusPagamento}
              onChange={(e) => setStatusPagamento(e.target.value)}
              aria-label="Filtrar por status"
            >
              <option value="">Todos os status</option>
              <option value="a_pagar">A pagar</option>
              <option value="pago">Pago</option>
            </select>
            <button type="submit" className="btn btn-secondary">Filtrar</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Incentivos cadastrados</div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          {loading ? (
            <div className="loading">Carregando incentivos...</div>
          ) : incentivos.length === 0 ? (
            <div className="empty-state incentivo-empty">
              <p>Nenhum incentivo cadastrado ainda.</p>
              <button type="button" className="btn btn-primary" onClick={abrirNovo}>
                Cadastrar primeiro incentivo
              </button>
            </div>
          ) : (
            <table className="incentivo-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Parceiro</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {incentivos.map((incentivo) => (
                  <tr key={incentivo.id}>
                    <td>
                      <strong>{incentivo.numero_pedido || incentivo.venda_numero}</strong>
                      <div className="hint-text">{formatDate(incentivo.venda_criado_em)}</div>
                    </td>
                    <td>
                      <strong>{incentivo.parceiro_nome}</strong>
                      {incentivo.parceiro_escritorio && (
                        <div className="hint-text">{incentivo.parceiro_escritorio}</div>
                      )}
                    </td>
                    <td>{incentivo.cliente_nome}</td>
                    <td>
                      <strong>{formatCurrency(incentivo.valor_comissao)}</strong>
                      <div className="hint-text">
                        {incentivo.tipo_calculo === 'percentual'
                          ? `${incentivo.valor_informado}% do pedido`
                          : 'Valor fixo'}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={incentivo.status_pagamento} />
                    </td>
                    <td>
                      {incentivo.status_pagamento === 'pago'
                        ? formatDate(incentivo.data_pagamento)
                        : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => abrirEdicao(incentivo)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalMode && !modalLoading && (
        <IncentivoParceiroModal
          mode={modalMode}
          incentivo={editando}
          onClose={fecharModal}
          onSave={handleSave}
          onRemove={handleRemove}
        />
      )}
    </>
  );
}
