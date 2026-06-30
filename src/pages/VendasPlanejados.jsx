import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import { formatCurrency, formatDate } from '../utils/format';

const base = '/ferramentas-venda/vendas-planejados';

export default function VendasPlanejados() {
  const [vendas, setVendas] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const { confirm, success: showSuccess } = useFeedback();

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listVendasPlanejados(term);
      setVendas(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id, numero) => {
    const ok = await confirm({
      title: 'Excluir venda planejada',
      message: `Deseja excluir a venda ${numero}? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Manter',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteVendaPlanejado(id);
      showSuccess(`Venda ${numero} excluída.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <header className="page-header">
        <h2>Vendas planejados</h2>
        <p>Pedidos de móveis planejados com conferência de medidas, anexos e espelho para impressão</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

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
          + Nova venda planejada
        </Link>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando vendas...</div>
          ) : vendas.length === 0 ? (
            <div className="empty-state">
              {busca.trim()
                ? 'Nenhuma venda encontrada para esta busca.'
                : 'Nenhuma venda planejada cadastrada. Clique em "+ Nova venda planejada" para começar.'}
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
                  <th>Medidas conf.</th>
                  <th>Total</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.numero}</strong></td>
                    <td><strong>{v.numero_pedido || '—'}</strong></td>
                    <td>{v.cliente_nome}</td>
                    <td>{v.vendedor_nome || '—'}</td>
                    <td>{v.orcamento_planejado_numero || '—'}</td>
                    <td>{v.medidas_conferidas ? 'Sim' : 'Não'}</td>
                    <td>{formatCurrency(v.total)}</td>
                    <td>{formatDate(v.criado_em)}</td>
                    <td>
                      <Link to={`${base}/${v.id}`} className="btn btn-secondary btn-sm">
                        Abrir
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
    </>
  );
}
