import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../constants/auth';
import PageAlert from '../components/PageAlert';
import { formatCurrency, formatDimensions } from '../utils/format';
import ProdutoModal from '../components/ProdutoModal';
import EtiquetaProdutoModal from '../components/EtiquetaProdutoModal';
import ProdutoThumb from '../components/ProdutoThumb';

export default function Produtos() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [etiquetaProduto, setEtiquetaProduto] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { confirm, success: showSuccess } = useFeedback();
  const { hasPermission } = useAuth();
  const podeDesativar = hasPermission(PERMISSIONS.CADASTROS);

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const [p, c, f] = await Promise.all([
        api.listProdutos(term),
        api.listCategorias(),
        api.listFornecedores(),
      ]);
      setProdutos(p);
      setCategorias(c);
      setFornecedores(f);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    load(busca);
  };

  const handleSave = async (data) => {
    if (editing) {
      await api.updateProduto(editing.id, data);
      showSuccess(`Produto ${data.sku || editing.sku} atualizado.`);
    } else {
      await api.createProduto(data);
      showSuccess(`Produto ${data.sku} cadastrado.`);
    }
    setModalOpen(false);
    setEditing(null);
    await load();
  };

  const handleDelete = async (id, sku) => {
    const ok = await confirm({
      title: 'Desativar produto',
      message: `Deseja desativar o produto ${sku}? Ele deixará de aparecer nas listagens ativas.`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteProduto(id);
      showSuccess(`Produto ${sku} desativado.`);
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
        <h2>Produtos</h2>
        <p>Cadastro de móveis e itens da loja — clique em Editar para alterar um produto</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={handleSearch}>
          <input
            className="search-input"
            placeholder="Buscar por nome ou SKU..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <button type="button" className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>
          + Novo produto
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando produtos...</div>
          ) : produtos.length === 0 ? (
            <div className="empty-state empty-state-cta">
              <p>
                {busca.trim()
                  ? 'Nenhum produto encontrado para esta busca.'
                  : 'Nenhum produto cadastrado ainda.'}
              </p>
              {!busca.trim() && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { setEditing(null); setModalOpen(true); }}
                >
                  Cadastrar primeiro produto
                </button>
              )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>SKU</th>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Dimensões</th>
                  <th>Estoque</th>
                  <th>Preço venda</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id}>
                    <td><ProdutoThumb produtoId={p.id} alt={p.nome} /></td>
                    <td><strong>{p.sku}</strong></td>
                    <td>{p.nome}</td>
                    <td>{p.categoria_nome || '-'}</td>
                    <td>{formatDimensions(p)}</td>
                    <td>
                      <span className={p.quantidade_total <= p.estoque_minimo ? 'badge badge-warning' : ''}>
                        {p.quantidade_total}
                      </span>
                    </td>
                    <td>{formatCurrency(p.preco_venda)}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditing(p); setModalOpen(true); }}>
                        Editar
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEtiquetaProduto(p)}
                      >
                        Etiqueta
                      </button>
                      {podeDesativar && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(p.id, p.sku)}
                            disabled={deletingId === p.id}
                          >
                            {deletingId === p.id ? 'Desativando...' : 'Desativar'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalOpen && (
        <ProdutoModal
          produto={editing}
          categorias={categorias}
          fornecedores={fornecedores}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {etiquetaProduto && (
        <EtiquetaProdutoModal
          produto={etiquetaProduto}
          onClose={() => setEtiquetaProduto(null)}
        />
      )}
    </>
  );
}
