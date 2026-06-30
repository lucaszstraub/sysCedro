import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatCurrency, formatDimensions } from '../utils/format';
import ProdutoModal from './ProdutoModal';
import ProdutoThumb from './ProdutoThumb';

export default function SelecionarProdutoModal({
  onClose,
  onSelect,
  onNovoProduto,
  fornecedorFixo = null,
  closeOnSelect = false,
}) {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [editingProduto, setEditingProduto] = useState(null);

  const [busca, setBusca] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');

  const fornecedorFiltro = fornecedorFixo ? String(fornecedorFixo) : fornecedorId;
  const fornecedorFixoNome = fornecedores.find((f) => String(f.id) === String(fornecedorFixo))?.nome;

  useEffect(() => {
    (async () => {
      try {
        const [p, c, f] = await Promise.all([
          api.listProdutos(''),
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
    })();
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (categoriaId && String(p.categoria_id) !== categoriaId) return false;
      if (fornecedorFiltro && String(p.fornecedor_id) !== fornecedorFiltro) return false;
      if (!termo) return true;
      const haystack = [
        p.sku,
        p.nome,
        p.material,
        p.cor,
        p.categoria_nome,
        p.fornecedor_nome,
        p.descricao,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(termo);
    });
  }, [produtos, busca, categoriaId, fornecedorFiltro]);

  const handleSelect = (produto) => {
    onSelect(produto);
    if (closeOnSelect) {
      onClose();
      return;
    }
    setFeedback(`${produto.sku} adicionado ao ambiente.`);
    setTimeout(() => setFeedback(''), 2000);
  };

  const reloadProdutos = async () => {
    const p = await api.listProdutos('');
    setProdutos(p);
  };

  const handleSaveEdit = async (data) => {
    await api.updateProduto(editingProduto.id, data);
    await reloadProdutos();
    setEditingProduto(null);
    setFeedback(`${editingProduto.sku} atualizado.`);
    setTimeout(() => setFeedback(''), 2500);
  };

  const limparFiltros = () => {
    setBusca('');
    setCategoriaId('');
    if (!fornecedorFixo) setFornecedorId('');
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-xl picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Selecionar produto</h3>
            <p className="picker-subtitle">
              {fornecedorFixo
                ? `Produtos do fornecedor ${fornecedorFixoNome || 'selecionado'}`
                : 'Busque e filtre o catálogo para adicionar itens ao ambiente'}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body picker-body">
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          {feedback && <div className="alert alert-success">{feedback}</div>}

          <div className="picker-filters">
            <div className="picker-search-wrap">
              <input
                className="search-input picker-search"
                placeholder="Pesquisar por SKU, nome, material, cor, categoria..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoFocus
              />
            </div>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {!fornecedorFixo && (
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                <option value="">Todos os fornecedores</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={limparFiltros}>
              Limpar filtros
            </button>
          </div>

          <div className="picker-meta">
            <span>{filtrados.length} produto(s) encontrado(s)</span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link to="/gestao-estoque/produtos" className="btn btn-secondary btn-sm" onClick={onClose}>
                Catálogo completo
              </Link>
              {onNovoProduto && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={onNovoProduto}>
                  + Cadastrar novo produto
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="loading">Carregando catálogo...</div>
          ) : filtrados.length === 0 ? (
            <div className="empty-state">Nenhum produto encontrado com os filtros aplicados.</div>
          ) : (
            <div className="picker-table-wrap">
              <table className="picker-table">
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>SKU</th>
                    <th>Nome</th>
                    <th>Categoria</th>
                    <th>Material / Cor</th>
                    <th>Dimensões</th>
                    <th>Estoque</th>
                    <th>Preço</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((p) => (
                    <tr key={p.id}>
                      <td><ProdutoThumb produtoId={p.id} alt={p.nome} /></td>
                      <td><strong>{p.sku}</strong></td>
                      <td>{p.nome}</td>
                      <td>{p.categoria_nome || '—'}</td>
                      <td>{[p.material, p.cor].filter(Boolean).join(' / ') || '—'}</td>
                      <td>{formatDimensions(p)}</td>
                      <td>{p.quantidade_total ?? 0}</td>
                      <td>{formatCurrency(p.preco_venda)}</td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingProduto(p)}>
                          Editar
                        </button>
                        {' '}
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSelect(p)}>
                          Adicionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer picker-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>Concluir</button>
        </div>
        </div>
      </div>

      {editingProduto && (
        <ProdutoModal
          produto={editingProduto}
          categorias={categorias}
          fornecedores={fornecedores}
          onClose={() => setEditingProduto(null)}
          onSave={handleSaveEdit}
        />
      )}
    </>
  );
}
