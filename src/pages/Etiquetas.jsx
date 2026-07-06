import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import PageAlert from '../components/PageAlert';
import EtiquetaProdutoModal, { EtiquetaPreviewUnit } from '../components/EtiquetaProdutoModal';
import { useFeedback } from '../context/FeedbackContext';
import {
  flattenSelecaoEtiquetas,
  folhasNecessarias,
  LABELS_PER_PAGE,
  mesclarNaSelecao,
  totalEtiquetasSelecao,
} from '../utils/etiquetaProduto';
import { formatCurrency, formatDate } from '../utils/format';

function EtiquetaSelecaoPanel({
  selecao,
  onAtualizarQuantidade,
  onRemover,
  onLimpar,
  onImprimir,
  imprimindo,
}) {
  const total = totalEtiquetasSelecao(selecao);
  const folhas = folhasNecessarias(total);
  const etiquetasFlat = useMemo(() => flattenSelecaoEtiquetas(selecao), [selecao]);
  const primeiraFolha = etiquetasFlat.slice(0, LABELS_PER_PAGE);

  if (!selecao.length) {
    return (
      <div className="empty-state etiquetas-selecao-vazia">
        Nenhuma etiqueta na seleção. Busque produtos na outra aba e clique em &quot;Adicionar&quot;.
      </div>
    );
  }

  return (
    <div className="etiquetas-selecao">
      <div className="etiquetas-selecao-resumo">
        <div>
          <strong>{total}</strong> etiqueta{total !== 1 ? 's' : ''} ·{' '}
          <strong>{folhas}</strong> folha{folhas !== 1 ? 's' : ''} A4
        </div>
        <div className="etiquetas-selecao-acoes">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onLimpar}>
            Limpar seleção
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onImprimir}
            disabled={imprimindo}
          >
            {imprimindo ? 'Gerando PDF...' : 'Gerar folha de impressão'}
          </button>
        </div>
      </div>

      <div className="etiquetas-selecao-grid">
        <div className="etiquetas-selecao-lista-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Produto</th>
                <th>Preço</th>
                <th>Qtd</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {selecao.map((item) => (
                <tr key={item.key}>
                  <td><strong>{item.sku}</strong></td>
                  <td>{item.nome}</td>
                  <td>{formatCurrency(item.preco_venda)}</td>
                  <td>
                    <div className="etiquetas-qty-control">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onAtualizarQuantidade(item.key, item.quantidade - 1)}
                        disabled={item.quantidade <= 1}
                      >
                        −
                      </button>
                      <span>{item.quantidade}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onAtualizarQuantidade(item.key, item.quantidade + 1)}
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onRemover(item.key)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="etiquetas-selecao-preview-wrap">
          <p className="hint-text etiqueta-preview-label">Prévia da 1ª folha A4</p>
          <article className="etiqueta-sheet-preview" aria-hidden="true">
            <div className="etiqueta-sheet-grid">
              {Array.from({ length: LABELS_PER_PAGE }, (_, i) => (
                <div
                  key={i}
                  className={`etiqueta-sheet-cell${i < primeiraFolha.length ? '' : ' etiqueta-sheet-cell--vazia'}`}
                >
                  {primeiraFolha[i] && (
                    <div className="etiqueta-preview-frame">
                      <EtiquetaPreviewUnit
                        form={primeiraFolha[i]}
                        precoExibicao={formatCurrency(primeiraFolha[i].preco_venda)}
                        compact
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </article>
          {folhas > 1 && (
            <p className="hint-text etiqueta-sheet-hint">
              As demais etiquetas continuam nas próximas folhas, na mesma ordem da lista.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Etiquetas() {
  const [aba, setAba] = useState('buscar');
  const [buscaCatalogo, setBuscaCatalogo] = useState('');
  const [buscaRecebidos, setBuscaRecebidos] = useState('');
  const [produtos, setProdutos] = useState([]);
  const [recebidos, setRecebidos] = useState([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [loadingRecebidos, setLoadingRecebidos] = useState(true);
  const [error, setError] = useState('');
  const [selecao, setSelecao] = useState([]);
  const [produtoModal, setProdutoModal] = useState(null);
  const [modalQuantidade, setModalQuantidade] = useState(1);
  const [abrindoId, setAbrindoId] = useState(null);
  const [imprimindo, setImprimindo] = useState(false);
  const { runWithFeedback } = useFeedback();

  const totalSelecao = totalEtiquetasSelecao(selecao);

  const loadCatalogo = async (term = buscaCatalogo) => {
    setLoadingCatalogo(true);
    setError('');
    try {
      setProdutos(await api.listProdutos(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingCatalogo(false);
    }
  };

  const loadRecebidos = async (term = buscaRecebidos) => {
    setLoadingRecebidos(true);
    setError('');
    try {
      setRecebidos(await api.listRecebimentosParaEtiquetas(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRecebidos(false);
    }
  };

  useEffect(() => {
    loadCatalogo();
    loadRecebidos();
  }, []);

  const abrirAdicionar = async (produto, quantidadePadrao = 1) => {
    const id = produto.id || produto.produto_id;
    setAbrindoId(id);
    setError('');
    try {
      const detalhe = produto.sku && produto.id
        ? produto
        : await api.getProduto(id);
      setModalQuantidade(quantidadePadrao);
      setProdutoModal(detalhe);
    } catch (err) {
      setError(err.message);
    } finally {
      setAbrindoId(null);
    }
  };

  const handleAdicionar = (item) => {
    setSelecao((prev) => mesclarNaSelecao(prev, item));
    setAba('selecao');
  };

  const atualizarQuantidade = (key, quantidade) => {
    if (quantidade < 1) return;
    setSelecao((prev) => prev.map((item) => (
      item.key === key ? { ...item, quantidade } : item
    )));
  };

  const removerItem = (key) => {
    setSelecao((prev) => prev.filter((item) => item.key !== key));
  };

  const limparSelecao = () => setSelecao([]);

  const gerarImpressao = async () => {
    if (!selecao.length) return;
    setImprimindo(true);
    setError('');
    try {
      const etiquetas = flattenSelecaoEtiquetas(selecao);
      const result = await runWithFeedback(
        () => api.gerarPdfFolhasEtiquetas({ etiquetas }),
        {
          loading: 'Gerando folhas de etiquetas...',
          success: 'PDF gerado com sucesso.',
          error: 'Não foi possível gerar as folhas.',
        }
      );
      if (!result?.cancelled) {
        setSelecao([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImprimindo(false);
    }
  };

  return (
    <>
      <header className="page-header">
        <h2>Etiquetas</h2>
        <p>Monte a seleção com vários produtos e gere as folhas A4 de uma vez</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="etiquetas-tabs">
        <button
          type="button"
          className={`etiquetas-tab${aba === 'buscar' ? ' etiquetas-tab--active' : ''}`}
          onClick={() => setAba('buscar')}
        >
          Buscar produtos
        </button>
        <button
          type="button"
          className={`etiquetas-tab${aba === 'selecao' ? ' etiquetas-tab--active' : ''}`}
          onClick={() => setAba('selecao')}
        >
          Seleção{totalSelecao > 0 ? ` (${totalSelecao})` : ''}
        </button>
      </div>

      {aba === 'selecao' ? (
        <section className="card etiquetas-section">
          <div className="card-header">Seleção para impressão</div>
          <div className="card-body">
            <EtiquetaSelecaoPanel
              selecao={selecao}
              onAtualizarQuantidade={atualizarQuantidade}
              onRemover={removerItem}
              onLimpar={limparSelecao}
              onImprimir={gerarImpressao}
              imprimindo={imprimindo}
            />
          </div>
        </section>
      ) : (
        <>
          <section className="card etiquetas-section">
            <div className="card-header">Catálogo de produtos</div>
            <div className="card-body">
              <p className="hint-text etiquetas-section-hint">
                Busque um produto e adicione à seleção. Você pode combinar vários na mesma folha A4.
              </p>
              <form
                className="toolbar etiquetas-toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  loadCatalogo(buscaCatalogo);
                }}
              >
                <input
                  className="search-input"
                  placeholder="Buscar por nome ou SKU..."
                  value={buscaCatalogo}
                  onChange={(e) => setBuscaCatalogo(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary btn-sm">Buscar</button>
              </form>

              {loadingCatalogo ? (
                <div className="loading">Carregando produtos...</div>
              ) : produtos.length === 0 ? (
                <div className="empty-state">Nenhum produto encontrado.</div>
              ) : (
                <ul className="etiquetas-lista">
                  {produtos.map((p) => (
                    <li key={p.id} className="etiquetas-lista-item">
                      <div className="etiquetas-lista-info">
                        <strong>{p.sku}</strong>
                        <span>{p.nome}</span>
                        <span className="hint-text">{formatCurrency(p.preco_venda)}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => abrirAdicionar(p, 1)}
                        disabled={abrindoId === p.id}
                      >
                        {abrindoId === p.id ? 'Abrindo...' : 'Adicionar'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card etiquetas-section">
            <div className="card-header">Produtos recebidos</div>
            <div className="card-body" style={{ padding: 0 }}>
              <p className="hint-text etiquetas-section-hint" style={{ padding: '1rem 1rem 0' }}>
                Itens recém-recebidos — a quantidade sugerida é a do recebimento.
              </p>
              <form
                className="toolbar etiquetas-toolbar"
                style={{ padding: '0 1rem 1rem' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  loadRecebidos(buscaRecebidos);
                }}
              >
                <input
                  className="search-input"
                  placeholder="Buscar recebimento..."
                  value={buscaRecebidos}
                  onChange={(e) => setBuscaRecebidos(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary btn-sm">Buscar</button>
              </form>

              {loadingRecebidos ? (
                <div className="loading">Carregando recebimentos...</div>
              ) : recebidos.length === 0 ? (
                <div className="empty-state">Nenhum produto recebido recentemente.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Recebido em</th>
                      <th>SKU</th>
                      <th>Produto</th>
                      <th>Qtd</th>
                      <th>Encomenda</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recebidos.map((r) => (
                      <tr key={r.recebimento_id}>
                        <td>{formatDate(r.data_recebimento)}</td>
                        <td><strong>{r.sku}</strong></td>
                        <td>{r.produto_nome}</td>
                        <td>{r.quantidade}</td>
                        <td className="hint-text">{r.encomenda_numero}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => abrirAdicionar(
                              { id: r.produto_id },
                              Math.max(Number(r.quantidade) || 1, 1)
                            )}
                            disabled={abrindoId === r.produto_id}
                          >
                            {abrindoId === r.produto_id ? 'Abrindo...' : 'Adicionar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {produtoModal && (
        <EtiquetaProdutoModal
          produto={produtoModal}
          mode="add"
          defaultQuantidade={modalQuantidade}
          onAdd={handleAdicionar}
          onClose={() => setProdutoModal(null)}
        />
      )}
    </>
  );
}
