import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PERMISSIONS } from '../constants/auth';
import { useAuth } from '../context/AuthContext';
import { formatMarkup } from '../constants/markup';
import { formatCurrency, formatDate } from '../utils/format';
import PageAlert from '../components/PageAlert';
import VisaoVendasPedidoModal from '../components/VisaoVendasPedidoModal';

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function inicioMes(date) {
  return toISODate(new Date(date.getFullYear(), date.getMonth(), 1));
}

function fimMes(date) {
  return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function periodoPreset(preset) {
  const hoje = new Date();
  if (preset === 'mes_atual') return { dataInicio: inicioMes(hoje), dataFim: fimMes(hoje) };
  if (preset === 'mes_anterior') {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return { dataInicio: inicioMes(ref), dataFim: fimMes(ref) };
  }
  if (preset === 'ano_atual') {
    return { dataInicio: `${hoje.getFullYear()}-01-01`, dataFim: `${hoje.getFullYear()}-12-31` };
  }
  if (preset === 'ultimos_30') {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 29);
    return { dataInicio: toISODate(inicio), dataFim: toISODate(hoje) };
  }
  if (preset === 'ultimos_90') {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 89);
    return { dataInicio: toISODate(inicio), dataFim: toISODate(hoje) };
  }
  return { dataInicio: '', dataFim: '' };
}

const PERIODO_OPCOES = [
  { value: 'mes_atual', label: 'Este mês' },
  { value: 'mes_anterior', label: 'Mês anterior' },
  { value: 'ultimos_30', label: '30 dias' },
  { value: 'ultimos_90', label: '90 dias' },
  { value: 'ano_atual', label: 'Este ano' },
  { value: 'personalizado', label: 'Personalizado' },
  { value: 'tudo', label: 'Tudo' },
];

function MarkupCell({ markup }) {
  if (markup == null) {
    return <span className="analise-muted" title="Custo real pendente">—</span>;
  }
  return <span className="analise-markup-value">{formatMarkup(markup)}</span>;
}

function KpiCard({ label, value, accent }) {
  return (
    <article className="analise-kpi-card" style={accent ? { '--kpi-accent': accent } : undefined}>
      <span className="analise-kpi-label">{label}</span>
      <strong className="analise-kpi-value">{value}</strong>
    </article>
  );
}

function PendenciaCard({ categoria, onAbrirPedido }) {
  return (
    <article className="analise-pendencia-card">
      <header className="analise-pendencia-card-header">
        <div>
          <h4>{categoria.titulo}</h4>
          <p>{categoria.descricao}</p>
        </div>
        <span className="analise-pendencia-count">{categoria.itens.length}</span>
      </header>
      <ul className="analise-pendencia-lista">
        {categoria.itens.map((item) => (
          <li key={`${categoria.id}-${item.venda_id}`} className="analise-pendencia-item">
            <div className="analise-pendencia-item-main">
              <strong>{item.numero_pedido || item.venda_numero}</strong>
              <span className="analise-muted">{item.cliente_nome}</span>
              <span className="analise-muted">{formatDate(item.venda_criado_em)}</span>
            </div>
            <div className="analise-pendencia-item-side">
              {item.valor > 0 && <span>{formatCurrency(item.valor)}</span>}
              {item.qtd_itens > 0 && !item.valor && (
                <span>{item.qtd_itens} item(ns)</span>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onAbrirPedido(item.venda_id)}
              >
                Ver pedido
              </button>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function VisaoVendas() {
  const { hasPermission } = useAuth();
  const [busca, setBusca] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [periodo, setPeriodo] = useState('mes_atual');
  const [dataInicio, setDataInicio] = useState(() => periodoPreset('mes_atual').dataInicio);
  const [dataFim, setDataFim] = useState(() => periodoPreset('mes_atual').dataFim);
  const [markupMinimo, setMarkupMinimo] = useState('');
  const [markupFiltro, setMarkupFiltro] = useState('acima');
  const [aba, setAba] = useState('pedidos');
  const [vendedores, setVendedores] = useState([]);
  const [dados, setDados] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filtros = useMemo(() => ({
    busca,
    vendedorId: vendedorId || null,
    dataInicio: dataInicio || null,
    dataFim: dataFim || null,
    markupMinimo: markupMinimo === '' ? null : markupMinimo,
    markupFiltro,
  }), [busca, vendedorId, dataInicio, dataFim, markupMinimo, markupFiltro]);

  const load = useCallback(async (nextFiltros = filtros) => {
    setLoading(true);
    setError('');
    try {
      setDados(await api.getVisaoGeralVendas(nextFiltros));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    api.listVendedores('', null).then(setVendedores).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(filtros), 250);
    return () => clearTimeout(timer);
  }, [filtros, load]);

  const handlePeriodoChange = (next) => {
    setPeriodo(next);
    if (next === 'tudo') {
      setDataInicio('');
      setDataFim('');
      return;
    }
    if (next === 'personalizado') {
      if (!dataInicio || !dataFim) {
        const range = periodoPreset('mes_atual');
        setDataInicio(range.dataInicio);
        setDataFim(range.dataFim);
      }
      return;
    }
    const range = periodoPreset(next);
    setDataInicio(range.dataInicio);
    setDataFim(range.dataFim);
  };

  const abrirDetalhe = async (vendaId) => {
    setError('');
    try {
      setDetalhe(await api.getVendaAnaliseMarkup(vendaId));
    } catch (err) {
      setError(err.message);
    }
  };

  const resumo = dados?.resumo;
  const pedidos = dados?.pedidos || [];
  const pendencias = dados?.pendencias?.categorias || [];
  const totalPendencias = dados?.pendencias?.total_pendencias || 0;

  const periodoLabel = dataInicio && dataFim
    ? `${formatDate(dataInicio)} – ${formatDate(dataFim)}`
    : 'Todo o histórico';

  return (
    <div className="analise-page">
      <header className="analise-hero">
        <div className="analise-hero-text">
          <p className="analise-eyebrow">Gestão comercial</p>
          <h2>Análise de vendas</h2>
          <p>Performance, markup por pedido e pendências que precisam da sua atenção.</p>
        </div>
        <div className="analise-hero-actions">
          <Link to="/ferramentas-venda/vendas" className="btn btn-secondary btn-sm">Vendas</Link>
          {hasPermission(PERMISSIONS.PARCEIROS) && (
            <Link to="/ferramentas-venda/incentivos-parceiros" className="btn btn-secondary btn-sm">
              Incentivos a parceiros
            </Link>
          )}
        </div>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="analise-toolbar">
        <div className="analise-toolbar-main">
          <div className="analise-periodo-chips" role="group" aria-label="Período">
            {PERIODO_OPCOES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`analise-chip${periodo === opt.value ? ' is-active' : ''}`}
                onClick={() => handlePeriodoChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="analise-toolbar-fields">
            <input
              type="search"
              className="analise-search"
              placeholder="Buscar pedido, cliente ou produto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar"
            />
            <select
              className="analise-select"
              value={vendedorId}
              onChange={(e) => setVendedorId(e.target.value)}
              aria-label="Vendedor"
            >
              <option value="">Todas as vendedoras</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
            <div className="analise-markup-filter" role="group" aria-label="Filtro de markup">
              <select
                className="analise-select analise-markup-filter-modo"
                value={markupFiltro}
                onChange={(e) => setMarkupFiltro(e.target.value)}
                aria-label="Modo do filtro de markup"
              >
                <option value="acima">Markup ≥</option>
                <option value="abaixo">Markup &lt;</option>
              </select>
              <input
                type="number"
                className="analise-markup-filter-valor"
                min="0"
                step="0.01"
                placeholder="Ex.: 2.00"
                value={markupMinimo}
                onChange={(e) => setMarkupMinimo(e.target.value)}
                aria-label="Valor mínimo de markup"
              />
            </div>
          </div>
        </div>

        {periodo === 'personalizado' && (
          <div className="analise-toolbar-dates">
            <label className="analise-field">
              <span>Data início</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                required
              />
            </label>
            <label className="analise-field">
              <span>Data fim</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                required
              />
            </label>
            <p className="hint-text analise-toolbar-dates-hint">
              Selecione o intervalo personalizado para o relatório.
            </p>
          </div>
        )}

        <div className="analise-toolbar-meta">
          <span>{periodoLabel}</span>
          {vendedorId && (
            <span> · {vendedores.find((v) => String(v.id) === vendedorId)?.nome}</span>
          )}
          {resumo?.filtro_markup_ativo && (
            <span>
              {' · Markup '}
              {resumo.filtro_markup_modo === 'abaixo' ? '< ' : '≥ '}
              {formatMarkup(resumo.filtro_markup_valor)}
            </span>
          )}
          {loading && <span className="analise-loading-dot">Atualizando...</span>}
        </div>
      </div>

      {loading && !dados ? (
        <div className="loading">Carregando análise...</div>
      ) : resumo && (
        <>
          <section className="analise-kpi-grid" aria-label="Indicadores">
            <KpiCard label="Nº de vendas" value={resumo.numero_vendas} accent="#2b6cb0" />
            <KpiCard label="Valor total" value={formatCurrency(resumo.valor_total_vendas)} accent="#9a6b3c" />
            <KpiCard label="Custo total" value={formatCurrency(resumo.custo_total)} accent="#4a5568" />
            <KpiCard
              label="Markup"
              value={formatMarkup(resumo.markup)}
              accent="#2f855a"
            />
            <KpiCard label="Ticket médio" value={formatCurrency(resumo.ticket_medio)} accent="#553c9a" />
          </section>

          <div className="analise-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'pedidos'}
              className={`analise-tab${aba === 'pedidos' ? ' is-active' : ''}`}
              onClick={() => setAba('pedidos')}
            >
              Resumo dos pedidos
              <span className="analise-tab-count">{pedidos.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'pendencias'}
              className={`analise-tab${aba === 'pendencias' ? ' is-active' : ''}`}
              onClick={() => setAba('pendencias')}
            >
              Pendências
              {totalPendencias > 0 && (
                <span className="analise-tab-badge">{totalPendencias}</span>
              )}
            </button>
          </div>

          {aba === 'pedidos' && (
            <section className="analise-panel">
              <div className="analise-table-wrap">
                <table className="analise-table analise-table--pedidos">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Pedido</th>
                      <th>Vendedora</th>
                      <th>Qtd itens</th>
                      <th>Valor</th>
                      <th>Markup</th>
                      <th>RT</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="empty-state">
                          Nenhum pedido encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      pedidos.map((pedido) => (
                        <tr
                          key={pedido.venda_id}
                          className={[
                            pedido.tem_pendencia ? 'analise-row-pendente' : '',
                            pedido.tem_a_receber ? 'analise-row-a-receber' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          <td>{formatDate(pedido.venda_criado_em)}</td>
                          <td>
                            <strong>{pedido.numero_pedido || pedido.venda_numero}</strong>
                            <div className="analise-muted">{pedido.cliente_nome}</div>
                            {pedido.tem_alteracao_pos_venda && (
                              <span className="analise-tag">Alterado</span>
                            )}
                          </td>
                          <td>{pedido.vendedor_nome || '—'}</td>
                          <td>{pedido.qtd_itens}</td>
                          <td><strong>{formatCurrency(pedido.valor_total)}</strong></td>
                          <td><MarkupCell markup={pedido.markup_pedido} /></td>
                          <td>{formatCurrency(pedido.rt || 0)}</td>
                          <td className="analise-actions-cell">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => abrirDetalhe(pedido.venda_id)}
                            >
                              Ver mais
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {aba === 'pendencias' && (
            <section className="analise-panel">
              {pendencias.length === 0 ? (
                <div className="analise-empty-pendencias">
                  <strong>Nenhuma pendência no período</strong>
                  <p>Todos os pedidos estão em dia com pagamentos, consignados e custos.</p>
                </div>
              ) : (
                <div className="analise-pendencias-grid">
                  {pendencias.map((categoria) => (
                    <PendenciaCard
                      key={categoria.id}
                      categoria={categoria}
                      onAbrirPedido={abrirDetalhe}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <VisaoVendasPedidoModal detalhe={detalhe} onClose={() => setDetalhe(null)} />
    </div>
  );
}
