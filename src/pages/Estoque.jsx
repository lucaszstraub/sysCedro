import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageAlert, { InlineAlert } from '../components/PageAlert';
import MovimentacaoModal from '../components/MovimentacaoModal';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS, isLocalizacaoNaoAlocados } from '../constants/estoque';
import { useFeedback } from '../context/FeedbackContext';
import { formatDateTime } from '../utils/format';

function ReservasModal({ produto, onClose }) {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setReservas([]);

    api.listReservasProduto(Number(produto.produto_id))
      .then((data) => {
        if (cancelled) return;
        setReservas(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Não foi possível carregar as reservas deste produto.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [produto.produto_id]);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Compromissos — {produto.produto_nome}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">&times;</button>
        </div>
        <div className="modal-body">
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          {loading ? (
            <div className="loading">Carregando compromissos...</div>
          ) : !error && reservas.length === 0 ? (
            <div className="empty-state">Nenhum compromisso ativo para este produto.</div>
          ) : !error && (
            <div className="picker-table-wrap">
              <table className="picker-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Item</th>
                    <th>Qtd comprometida</th>
                    <th>Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {reservas.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.numero_pedido || r.venda_numero || '—'}</strong></td>
                      <td>{r.cliente_nome || '—'}</td>
                      <td>{r.item_descricao || '—'}</td>
                      <td>{r.quantidade}</td>
                      <td>{formatDateTime(r.criado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const OPCOES = [
  {
    id: 'localizacoes',
    label: 'Conferir estoque por localizações',
    description: 'Veja cada endereço e os produtos alocados com suas quantidades.',
  },
  {
    id: 'total',
    label: 'Conferir estoque total',
    description: 'Lista geral: estoque, disponibilidade, localização e última movimentação.',
  },
  {
    id: 'movimentacoes',
    label: 'Realizar movimentações',
    description: 'Mover entre endereços ou registrar Entregue (baixa estoque + compromisso).',
    navigate: '/gestao-estoque/movimentacoes',
  },
];

export default function Estoque() {
  const navigate = useNavigate();
  const { success: showSuccess } = useFeedback();

  const [modo, setModo] = useState(null);
  const [itens, setItens] = useState([]);
  const [localizacoes, setLocalizacoes] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reservasModal, setReservasModal] = useState(null);
  const [modalMovimentacao, setModalMovimentacao] = useState(null);

  const localizacoesDestino = useMemo(
    () => localizacoes.filter((l) => l.codigo !== CODIGO_LOCALIZACAO_NAO_ALOCADOS),
    [localizacoes]
  );

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const [data, locs] = await Promise.all([
        api.listEstoque(term),
        api.listLocalizacoes(),
      ]);
      setItens(Array.isArray(data) ? data : []);
      setLocalizacoes(Array.isArray(locs) ? locs : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (modo === 'localizacoes' || modo === 'total') {
      load('');
    }
  }, [modo]);

  const abrirModo = (opcao) => {
    if (opcao.navigate) {
      navigate(opcao.navigate);
      return;
    }
    setBusca('');
    setModo(opcao.id);
  };

  const produtosAgrupados = useMemo(() => {
    const map = new Map();
    for (const item of itens) {
      const key = item.produto_id;
      if (!map.has(key)) {
        map.set(key, {
          produto_id: item.produto_id,
          sku: item.sku,
          produto_nome: item.produto_nome,
          estoque_minimo: item.estoque_minimo,
          estoque_total: Number(item.estoque_total) || 0,
          reservado: Number(item.reservado) || 0,
          disponivel: Number(item.disponivel),
          ultima_movimentacao_em: item.ultima_movimentacao_produto_em || item.ultima_movimentacao_em || null,
          localizacoes: [],
        });
      }
      const grupo = map.get(key);
      if (item.localizacao_id) {
        grupo.localizacoes.push(item);
      }
      const mov = item.ultima_movimentacao_produto_em || item.ultima_movimentacao_em;
      if (mov && (!grupo.ultima_movimentacao_em || String(mov) > String(grupo.ultima_movimentacao_em))) {
        grupo.ultima_movimentacao_em = mov;
      }
    }
    return [...map.values()];
  }, [itens]);

  const porLocalizacao = useMemo(() => {
    const map = new Map();
    const locsOrdenadas = [...localizacoes].sort((a, b) => {
      if (a.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS) return -1;
      if (b.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS) return 1;
      return String(a.codigo).localeCompare(String(b.codigo));
    });

    for (const loc of locsOrdenadas) {
      map.set(loc.id, {
        id: loc.id,
        codigo: loc.codigo,
        nome: loc.nome,
        produtos: [],
        totalUnidades: 0,
      });
    }

    for (const item of itens) {
      if (!item.localizacao_id) continue;
      if (!map.has(item.localizacao_id)) {
        map.set(item.localizacao_id, {
          id: item.localizacao_id,
          codigo: item.localizacao_codigo,
          nome: item.localizacao_nome,
          produtos: [],
          totalUnidades: 0,
        });
      }
      const grupo = map.get(item.localizacao_id);
      grupo.produtos.push(item);
      grupo.totalUnidades += Number(item.quantidade) || 0;
    }

    return [...map.values()];
  }, [itens, localizacoes]);

  const porLocalizacaoFiltrado = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return porLocalizacao;
    return porLocalizacao
      .map((loc) => {
        const matchLoc = `${loc.codigo} ${loc.nome}`.toLowerCase().includes(termo);
        const produtos = matchLoc
          ? loc.produtos
          : loc.produtos.filter((p) => (
            `${p.sku} ${p.produto_nome}`.toLowerCase().includes(termo)
          ));
        if (!matchLoc && produtos.length === 0) return null;
        return {
          ...loc,
          produtos,
          totalUnidades: produtos.reduce((s, p) => s + (Number(p.quantidade) || 0), 0),
        };
      })
      .filter(Boolean);
  }, [porLocalizacao, busca]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtosAgrupados;
    return produtosAgrupados.filter((p) => {
      const locs = p.localizacoes.map((l) => `${l.localizacao_codigo} ${l.localizacao_nome}`).join(' ');
      return `${p.sku} ${p.produto_nome} ${locs}`.toLowerCase().includes(termo);
    });
  }, [produtosAgrupados, busca]);

  const abrirMovimentar = (produto, localizacaoId = null) => {
    setModalMovimentacao({
      produto: {
        id: produto.produto_id || produto.id,
        sku: produto.sku,
        nome: produto.produto_nome || produto.nome,
      },
      sugerirLocalizacaoId: localizacaoId,
    });
  };

  const handleSaveMovimentacao = async (data) => {
    const linhas = Array.isArray(data.linhas) ? data.linhas : [];
    if (linhas.length === 0) throw new Error('Informe ao menos uma quantidade de origem.');

    for (const linha of linhas) {
      await api.createMovimentacao({
        tipo: data.tipo,
        produto_id: data.produto_id,
        quantidade: linha.quantidade,
        localizacao_origem_id: linha.localizacao_origem_id,
        localizacao_destino_id: data.localizacao_destino_id,
        motivo: data.motivo,
        usuario: data.usuario || 'operador',
        data_movimento: data.data_movimento,
      });
    }

    setModalMovimentacao(null);
    const total = linhas.reduce((sum, l) => sum + Number(l.quantidade), 0);
    showSuccess(
      data.tipo === 'entregue'
        ? `Entregue registrado: ${total} un.`
        : `Movimentação registrada: ${total} un.`
    );
    await load(busca);
  };

  if (!modo) {
    return (
      <>
        <header className="page-header">
          <div>
            <h2>Estoque</h2>
            <p>Escolha como deseja consultar ou movimentar o armazém.</p>
          </div>
        </header>

        <div className="hub-grid cadastros-hub-grid estoque-opcoes-grid">
          {OPCOES.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              className="hub-card cadastro-option-card estoque-opcao-card"
              onClick={() => abrirModo(opcao)}
            >
              <strong>{opcao.label}</strong>
              <p className="hint-text">{opcao.description}</p>
            </button>
          ))}
        </div>
      </>
    );
  }

  const tituloModo = modo === 'localizacoes'
    ? 'Estoque por localizações'
    : 'Estoque total';

  return (
    <>
      <header className="page-header visao-vendas-header">
        <div>
          <h2>{tituloModo}</h2>
          <p>
            {modo === 'localizacoes'
              ? 'Produtos alocados em cada localização cadastrada.'
              : 'Visão consolidada por produto — estoque, disponibilidade e última movimentação (inclui recebimentos).'}
          </p>
        </div>
        <div className="visao-vendas-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setModo(null)}>
            Voltar às opções
          </button>
          <Link to="/gestao-estoque/movimentacoes" className="btn btn-primary">
            Realizar movimentações
          </Link>
        </div>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder={
              modo === 'localizacoes'
                ? 'Buscar localização, SKU ou produto...'
                : 'Buscar produto, SKU ou localização...'
            }
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
      </div>

      {loading ? (
        <div className="loading">Carregando estoque...</div>
      ) : modo === 'localizacoes' ? (
        porLocalizacaoFiltrado.length === 0 ? (
          <div className="empty-state">Nenhuma localização ou produto encontrado.</div>
        ) : (
          <div className="estoque-localizacoes-painel">
            {porLocalizacaoFiltrado.map((loc) => {
              const naoAloc = isLocalizacaoNaoAlocados({ codigo: loc.codigo });
              return (
                <div key={loc.id} className="card" style={{ marginBottom: '1rem' }}>
                  <div className={`card-header ${naoAloc ? 'card-header-priority' : ''}`}>
                    <span>
                      {naoAloc ? (
                        <span className="badge badge-nao-alocados">Não alocado</span>
                      ) : (
                        <strong>{loc.codigo}</strong>
                      )}
                      {' '}
                      <span className="hint-text">{loc.nome}</span>
                    </span>
                    <span className="badge badge-a-receber">{loc.totalUnidades} un.</span>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    {loc.produtos.length === 0 ? (
                      <div className="empty-state" style={{ padding: '1.25rem' }}>
                        Nenhum produto nesta localização.
                      </div>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Produto</th>
                            <th>Qtd</th>
                            <th>Última movimentação</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {loc.produtos.map((p) => (
                            <tr key={p.id || `${p.produto_id}-${p.localizacao_id}`}>
                              <td><strong>{p.sku}</strong></td>
                              <td>{p.produto_nome}</td>
                              <td><strong>{p.quantidade}</strong></td>
                              <td>{formatDateTime(p.ultima_movimentacao_em || p.atualizado_em)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => abrirMovimentar(p, p.localizacao_id)}
                                >
                                  Movimentar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {produtosFiltrados.length === 0 ? (
              <div className="empty-state">Nenhum produto em estoque</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th>Estoque</th>
                    <th title="Estoque − compromissos">Disponibilidade</th>
                    <th>Localização</th>
                    <th>Última movimentação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {produtosFiltrados.map((produto) => {
                    const disponivel = Number(produto.disponivel);
                    const reservado = Number(produto.reservado) || 0;
                    return (
                      <tr key={produto.produto_id}>
                        <td><strong>{produto.sku}</strong></td>
                        <td>{produto.produto_nome}</td>
                        <td>
                          <strong className={
                            produto.estoque_total <= produto.estoque_minimo ? 'badge badge-warning' : ''
                          }>
                            {produto.estoque_total}
                          </strong>
                        </td>
                        <td>
                          <strong className={disponivel < 0 ? 'text-danger' : ''}>
                            {disponivel}
                          </strong>
                          {reservado > 0 && (
                            <button
                              type="button"
                              className="btn btn-link btn-sm"
                              style={{ padding: 0, marginLeft: 6 }}
                              onClick={() => setReservasModal(produto)}
                              title="Ver compromissos"
                            >
                              <span className="badge badge-warning">{reservado} comp.</span>
                            </button>
                          )}
                        </td>
                        <td>
                          {produto.localizacoes.length > 0 ? (
                            <ul className="estoque-localizacoes-list">
                              {produto.localizacoes.map((loc) => {
                                const naoAlocado = isLocalizacaoNaoAlocados({ codigo: loc.localizacao_codigo });
                                return (
                                  <li key={loc.id || `${loc.produto_id}-${loc.localizacao_id}`}>
                                    {naoAlocado ? (
                                      <span className="badge badge-nao-alocados">Não alocado</span>
                                    ) : (
                                      <span>{loc.localizacao_codigo}</span>
                                    )}
                                    {': '}
                                    <strong>{loc.quantidade}</strong>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <span className="hint-text">Sem estoque físico</span>
                          )}
                        </td>
                        <td>{formatDateTime(produto.ultima_movimentacao_em)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => abrirMovimentar(produto)}
                          >
                            Movimentar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {reservasModal && (
        <ReservasModal produto={reservasModal} onClose={() => setReservasModal(null)} />
      )}

      {modalMovimentacao && (
        <MovimentacaoModal
          localizacoesDestino={localizacoesDestino}
          initialProduto={modalMovimentacao.produto}
          sugerirLocalizacaoId={modalMovimentacao.sugerirLocalizacaoId}
          onClose={() => setModalMovimentacao(null)}
          onSave={handleSaveMovimentacao}
        />
      )}
    </>
  );
}
