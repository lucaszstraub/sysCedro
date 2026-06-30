import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { userIsGerenteOuAdministrador } from '../constants/auth';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import { formatCurrency, formatDate } from '../utils/format';

const base = '/ferramentas-venda/vendas';

function PendenciasPedido({ venda }) {
  if (!venda?.tem_pendencia) return null;

  const partes = [];
  if (venda.tem_a_receber) {
    partes.push(`Pagamento a receber: ${formatCurrency(venda.valor_a_receber)}`);
  }
  if (venda.tem_consignado_nao_cobrado) {
    partes.push(
      `${venda.qtd_consignado_nao_cobrado} item(ns) consignado(s) entregue(s) sem cobrança`
    );
  }

  return (
    <div className="venda-pendencias-badges" title={partes.join(' · ')}>
      {venda.tem_a_receber && (
        <span className="badge badge-a-receber">A receber</span>
      )}
      {venda.tem_consignado_nao_cobrado && (
        <span className="badge badge-consignado-pendente">Consignado</span>
      )}
    </div>
  );
}

export default function Vendas() {
  const { user } = useAuth();
  const podeGerenciarDesativadas = userIsGerenteOuAdministrador(user);

  const [vendas, setVendas] = useState([]);
  const [vendasDesativadas, setVendasDesativadas] = useState([]);
  const [busca, setBusca] = useState('');
  const [buscaDesativadas, setBuscaDesativadas] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDesativadas, setLoadingDesativadas] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [restaurandoId, setRestaurandoId] = useState(null);
  const { confirm, success: showSuccess } = useFeedback();
  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listVendas(term);
      setVendas(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDesativadas = async (term = buscaDesativadas) => {
    if (!podeGerenciarDesativadas) return;
    setLoadingDesativadas(true);
    setError('');
    try {
      const data = await api.listVendasDesativadas(term);
      setVendasDesativadas(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDesativadas(false);
    }
  };

  useEffect(() => {
    load();
    if (podeGerenciarDesativadas) loadDesativadas();
  }, [podeGerenciarDesativadas]);

  const handleDelete = async (id, numero) => {
    const ok = await confirm({
      title: 'Excluir venda',
      message: `Deseja excluir a venda ${numero}? Para o vendedor ela deixará de aparecer na lista. Gerentes podem restaurá-la depois.`,
      confirmLabel: 'Excluir venda',
      cancelLabel: 'Manter',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteVenda(id);
      showSuccess(`Venda ${numero} excluída.`);
      await load();
      if (podeGerenciarDesativadas) await loadDesativadas();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestaurar = async (id, numero) => {
    const ok = await confirm({
      title: 'Restaurar venda',
      message: `Deseja restaurar a venda ${numero}? Reservas de estoque, entregas e comissões serão recalculadas.`,
      confirmLabel: 'Restaurar',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    setRestaurandoId(id);
    setError('');
    try {
      await api.restaurarVenda(id);
      showSuccess(`Venda ${numero} restaurada.`);
      await load();
      await loadDesativadas();
    } catch (err) {
      setError(err.message);
    } finally {
      setRestaurandoId(null);
    }
  };

  return (
    <>
      <header className="page-header">
        <h2>Vendas</h2>
        <p>Registre pedidos de venda importando de orçamentos ou cadastrando manualmente</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {vendas.some((v) => v.tem_pendencia) && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <strong>Pedidos com pendências</strong>
          <p style={{ margin: '0.35rem 0 0' }}>
            {vendas.filter((v) => v.tem_pendencia).length} pedido(s) com pagamento a receber
            e/ou produtos consignados entregues ainda não cobrados. Confira a coluna Pendências.
          </p>
        </div>
      )}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar por número, pedido ou cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <Link to={`${base}/novo`} className="btn btn-primary">
          + Nova venda
        </Link>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando vendas...</div>
          ) : vendas.length === 0 ? (
            <div className="empty-state empty-state-cta">
              <p>
                {busca.trim()
                  ? 'Nenhuma venda encontrada para esta busca.'
                  : 'Nenhuma venda cadastrada ainda.'}
              </p>
              {!busca.trim() && (
                <Link to={`${base}/novo`} className="btn btn-primary">
                  Cadastrar primeira venda
                </Link>
              )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Orçamento</th>
                  <th>Subtotal</th>
                  <th>Desconto extra</th>
                  <th>Total</th>
                  <th>Pendências</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id} className={v.tem_pendencia ? 'visao-row-a-receber' : (v.tem_alteracao_pos_venda ? 'visao-row-pendente' : '')}>
                    <td>
                      <strong>{v.numero}</strong>
                      {v.tem_alteracao_pos_venda && (
                        <div className="hint-text" title={v.nota_alteracao || ''}>Alterado</div>
                      )}
                    </td>
                    <td><strong>{v.numero_pedido || '—'}</strong></td>
                    <td>{v.cliente_nome}</td>
                    <td>{v.vendedor_nome || '—'}</td>
                    <td>{v.orcamento_numero || '—'}</td>
                    <td>{formatCurrency(v.subtotal_bruto || v.subtotal)}</td>
                    <td>{Number(v.desconto_extra || v.desconto) > 0.005 ? formatCurrency(v.desconto_extra || v.desconto) : '—'}</td>
                    <td>{formatCurrency(v.total)}</td>
                    <td><PendenciasPedido venda={v} /></td>
                    <td>{formatDate(v.criado_em)}</td>
                    <td>
                      {v.tem_a_receber && (
                        <>
                          <Link
                            to={`${base}/${v.id}/editar`}
                            state={{ aba: 'pagamento' }}
                            className="btn btn-primary btn-sm"
                          >
                            Receber
                          </Link>
                          {' '}
                        </>
                      )}
                      <Link to={`${base}/${v.id}/editar`} className="btn btn-secondary btn-sm">
                        Editar
                      </Link>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(v.id, v.numero)}
                        disabled={deletingId === v.id}
                      >
                        {deletingId === v.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {podeGerenciarDesativadas && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0 }}>Vendas desativadas</h3>
              <p className="hint-text" style={{ margin: '0.25rem 0 0' }}>
                Exclusões feitas por vendedores ficam aqui e podem ser restauradas.
              </p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); loadDesativadas(buscaDesativadas); }}>
              <input
                className="search-input"
                placeholder="Buscar venda desativada..."
                value={buscaDesativadas}
                onChange={(e) => setBuscaDesativadas(e.target.value)}
              />
            </form>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {loadingDesativadas ? (
              <div className="loading">Carregando vendas desativadas...</div>
            ) : vendasDesativadas.length === 0 ? (
              <div className="empty-state">Nenhuma venda desativada.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Vendedor</th>
                    <th>Total</th>
                    <th>Desativada em</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {vendasDesativadas.map((v) => (
                    <tr key={v.id} className="row-muted">
                      <td><strong>{v.numero}</strong></td>
                      <td><strong>{v.numero_pedido || '—'}</strong></td>
                      <td>{v.cliente_nome}</td>
                      <td>{v.vendedor_nome || '—'}</td>
                      <td>{formatCurrency(v.total)}</td>
                      <td>{formatDate(v.desativada_em || v.atualizado_em)}</td>
                      <td><span className="badge badge-estornado">Desativada</span></td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleRestaurar(v.id, v.numero)}
                          disabled={restaurandoId === v.id}
                        >
                          {restaurandoId === v.id ? 'Restaurando...' : 'Restaurar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
