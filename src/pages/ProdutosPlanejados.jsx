import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import ProdutoPlanejadoModal from '../components/ProdutoPlanejadoModal';
import { TIPO_FUNDO_LABEL, TIPO_PORTA_LABEL, formatDimensaoPlanejada } from '../constants/orcamentoPlanejado';
import { formatCurrency } from '../utils/format';

const base = '/gestao-estoque/produtos-planejados';

export default function ProdutosPlanejados() {
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { confirm, success: showSuccess } = useFeedback();

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      setProdutos(await api.listProdutosPlanejadosAll(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editando) {
      await api.updateProdutoPlanejado(editando.id, data);
      showSuccess(`Tipo de móvel ${data.nome} atualizado.`);
    } else {
      await api.createProdutoPlanejado(data);
      showSuccess(`Tipo de móvel ${data.nome} cadastrado.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (id, nome) => {
    const ok = await confirm({
      title: 'Desativar produto planejado',
      message: `Deseja desativar o tipo de móvel "${nome}"?`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteProdutoPlanejado(id);
      showSuccess(`Tipo de móvel ${nome} desativado.`);
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
        <h2>Produtos planejados</h2>
        <p>Cadastre templates de tipos de móvel com medidas e acabamentos padrão para uso em orçamentos e vendas</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar tipo de móvel..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <button type="button" className="btn btn-primary" onClick={() => { setEditando(null); setShowModal(true); }}>
          + Novo tipo de móvel
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando produtos planejados...</div>
          ) : produtos.length === 0 ? (
            <div className="empty-state">Nenhum tipo de móvel cadastrado.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tipo de móvel</th>
                  <th>Medidas em cm (L × P × A)</th>
                  <th>Fundo</th>
                  <th>Porta</th>
                  <th>Valor sugerido</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} className={!p.ativo ? 'row-muted' : ''}>
                    <td><strong>{p.nome}</strong></td>
                    <td>{formatDimensaoPlanejada(p.largura)} × {formatDimensaoPlanejada(p.profundidade)} × {formatDimensaoPlanejada(p.altura)}</td>
                    <td>{TIPO_FUNDO_LABEL[p.tipo_fundo] || p.tipo_fundo}</td>
                    <td>{TIPO_PORTA_LABEL[p.tipo_porta] || p.tipo_porta}</td>
                    <td>{Number(p.preco_unitario_sugerido) > 0 ? formatCurrency(p.preco_unitario_sugerido) : '—'}</td>
                    <td>{p.ativo ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEditando(p); setShowModal(true); }}
                      >
                        Editar
                      </button>
                      {' '}
                      {p.ativo && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(p.id, p.nome)}
                          disabled={deletingId === p.id}
                        >
                          {deletingId === p.id ? 'Desativando...' : 'Desativar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <ProdutoPlanejadoModal
          produto={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
