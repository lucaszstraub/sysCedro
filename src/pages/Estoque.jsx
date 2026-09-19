import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageAlert, { InlineAlert } from '../components/PageAlert';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS, isLocalizacaoNaoAlocados } from '../constants/estoque';
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

export default function Estoque() {
  const [itens, setItens] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reservasModal, setReservasModal] = useState(null);

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listEstoque(term);
      setItens(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const itensFiltrados = useMemo(() => {
    if (filtro === 'nao_alocados') {
      return itens.filter((i) => i.localizacao_codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS);
    }
    if (filtro === 'alocados') {
      return itens.filter((i) => i.localizacao_codigo !== CODIGO_LOCALIZACAO_NAO_ALOCADOS);
    }
    return itens;
  }, [itens, filtro]);

  const produtosAgrupados = useMemo(() => {
    const map = new Map();
    for (const item of itensFiltrados) {
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
          localizacoes: [],
        });
      }
      map.get(key).localizacoes.push(item);
    }
    return [...map.values()];
  }, [itensFiltrados]);

  const totalGeral = produtosAgrupados.reduce((sum, p) => sum + p.estoque_total, 0);
  const totalNaoAlocados = itens
    .filter((i) => i.localizacao_codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS)
    .reduce((sum, i) => sum + Number(i.quantidade), 0);
  const totalDisponivel = produtosAgrupados.reduce((sum, p) => sum + (Number(p.disponivel) || 0), 0);

  return (
    <>
      <header className="page-header visao-vendas-header">
        <div>
          <h2>Estoque</h2>
          <p>
            Estoque físico por localização e disponibilidade do produto
            (estoque − compromissos de vendas/encomendas).
          </p>
        </div>
        <div className="visao-vendas-header-actions">
          <Link to="/gestao-estoque/movimentacoes" className="btn btn-primary">
            Alocação e entregas
          </Link>
        </div>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {totalNaoAlocados > 0 && (
        <div className="alert alert-warning alocacao-alert">
          <strong>{totalNaoAlocados} unidade(s)</strong> ainda em Não alocados.
          {' '}
          <Link to="/gestao-estoque/movimentacoes">Ir para alocação</Link>
        </div>
      )}

      <div className="stats-grid" style={{ maxWidth: 720 }}>
        <div className="stat-card">
          <div className="label">Estoque físico total</div>
          <div className="value">{totalGeral}</div>
        </div>
        <div className="stat-card">
          <div className="label">Disponibilidade (soma)</div>
          <div className={`value ${totalDisponivel < 0 ? 'text-danger' : ''}`}>{totalDisponivel}</div>
        </div>
        <div className={`stat-card ${totalNaoAlocados > 0 ? 'stat-card-priority' : ''}`}>
          <div className="label">Em Não alocados</div>
          <div className="value">{totalNaoAlocados}</div>
        </div>
      </div>

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar produto, SKU ou localização..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <select
          className="filter-select"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          aria-label="Filtrar estoque"
        >
          <option value="todos">Todas as localizações</option>
          <option value="nao_alocados">Só Não alocados</option>
          <option value="alocados">Só endereços definitivos</option>
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando estoque...</div>
          ) : produtosAgrupados.length === 0 ? (
            <div className="empty-state">Nenhum item em estoque</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th title="Quantidade física somada em todas as localizações">Estoque</th>
                  <th title="Disponibilidade = estoque − compromissos. Pode ser negativa se houver venda em encomenda sem mercadoria.">
                    Disponibilidade
                  </th>
                  <th title="Reservado / comprometido a pedidos">Comprometido</th>
                  <th>Localizações</th>
                  <th>Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {produtosAgrupados.map((produto) => {
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
                        <strong className={disponivel < 0 ? 'text-danger' : disponivel === 0 && reservado > 0 ? 'text-muted' : ''}>
                          {disponivel}
                        </strong>
                      </td>
                      <td>
                        {reservado > 0 ? (
                          <button
                            type="button"
                            className="btn btn-link btn-sm"
                            style={{ padding: 0 }}
                            onClick={() => setReservasModal(produto)}
                            title="Ver pedidos comprometidos"
                          >
                            <span className="badge badge-warning">{reservado}</span>
                          </button>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td>
                        {produto.localizacoes.some((l) => l.localizacao_id) ? (
                          <ul className="estoque-localizacoes-list">
                            {produto.localizacoes.filter((l) => l.localizacao_id).map((loc) => {
                              const naoAlocado = isLocalizacaoNaoAlocados({ codigo: loc.localizacao_codigo });
                              return (
                                <li key={loc.id || `${loc.produto_id}-${loc.localizacao_id}`}>
                                  {naoAlocado ? (
                                    <span className="badge badge-nao-alocados">Não alocado</span>
                                  ) : (
                                    <span>{loc.localizacao_codigo}</span>
                                  )}
                                  {' '}
                                  <span className="hint-text">{loc.localizacao_nome}</span>
                                  {': '}
                                  <strong>{loc.quantidade}</strong>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <span className="hint-text">Sem estoque físico (só compromisso)</span>
                        )}
                      </td>
                      <td>
                        {formatDateTime(
                          produto.localizacoes
                            .map((l) => l.atualizado_em)
                            .filter(Boolean)
                            .sort()
                            .slice(-1)[0]
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {reservasModal && (
        <ReservasModal produto={reservasModal} onClose={() => setReservasModal(null)} />
      )}
    </>
  );
}
