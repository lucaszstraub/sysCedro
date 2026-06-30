import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { VENDAS_BASE } from '../constants/auth';
import { formatCurrency, formatDate } from '../utils/format';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import { SaldoValor } from './ControleComissoesShared';
import ControleComissoesPlanejadosTab from './ControleComissoesPlanejadosTab';

const PERFIL_LABEL = {
  vendedor: 'Vendedor',
  gerente: 'Gerente',
};

const MOTIVO_LABEL = {
  custo_encomenda: 'Custo de encomenda',
  cancelamento_venda: 'Cancelamento de venda',
  item_sem_custo: 'Sem custo real',
  incentivo_parceiro: 'Incentivo a parceiro',
  recalculo: 'Recálculo',
};

function PagamentoModal({
  open,
  periodo,
  formasPagamento,
  onClose,
  onSaved,
}) {
  const [valorPago, setValorPago] = useState('');
  const [dataPagamento, setDataPagamento] = useState(() => new Date().toISOString().split('T')[0]);
  const [formaPagamentoId, setFormaPagamentoId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !periodo) return;
    const sugerido = Math.max(periodo.liquido_a_pagar, 0);
    setValorPago(sugerido > 0 ? String(sugerido.toFixed(2)) : '');
    setDataPagamento(new Date().toISOString().split('T')[0]);
    setFormaPagamentoId('');
    setObservacoes('');
    setError('');
  }, [open, periodo]);

  if (!open || !periodo) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.salvarPagamentoComissao({
        ano: periodo.ano,
        mes: periodo.mes,
        perfil_comissao: periodo.perfil_comissao,
        valor_pago: Number(valorPago),
        data_pagamento: dataPagamento,
        forma_pagamento_id: formaPagamentoId ? Number(formaPagamentoId) : null,
        observacoes,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            Registrar pagamento — {PERFIL_LABEL[periodo.perfil_comissao]} / {periodo.mes_label}/{periodo.ano}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <PageAlert>{error}</PageAlert>}
            <div className="comissao-pagamento-resumo">
              <div><span>Total devido no mês</span><strong>{formatCurrency(periodo.valor_devido)}</strong></div>
              {periodo.perfil_comissao === 'vendedor' && (
                <>
                  <div>
                    <span>Vendedoras na divisão</span>
                    <strong>{periodo.qtd_vendedoras || 0}</strong>
                  </div>
                  <div>
                    <span>Valor individual</span>
                    <strong>
                      {periodo.valor_por_vendedora != null
                        ? formatCurrency(periodo.valor_por_vendedora)
                        : '—'}
                    </strong>
                  </div>
                </>
              )}
              <div><span>Já pago no mês</span><strong>{formatCurrency(periodo.valor_pago)}</strong></div>
              <div><span>Saldo total anterior</span><SaldoValor valor={periodo.saldo_anterior} /></div>
              <div><span>Sugestão para zerar</span><strong>{formatCurrency(Math.max(periodo.liquido_a_pagar, 0))}</strong></div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="pag-valor">Valor pago</label>
                <input
                  id="pag-valor"
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  value={valorPago}
                  onChange={(e) => setValorPago(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="pag-data">Data do pagamento</label>
                <input
                  id="pag-data"
                  type="date"
                  className="form-control"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  required
                />
              </div>
              <div className="form-group full-width">
                <label htmlFor="pag-forma">Forma de pagamento</label>
                <select
                  id="pag-forma"
                  className="form-control"
                  value={formaPagamentoId}
                  onChange={(e) => setFormaPagamentoId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {formasPagamento.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full-width">
                <label htmlFor="pag-obs">Observações</label>
                <textarea
                  id="pag-obs"
                  className="form-control"
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Registrar pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PeriodoRow({
  periodo,
  onRegistrar,
  onExpandir,
  expandido,
  ajustes,
  loadingAjustes,
  onExcluirPagamento,
}) {
  return (
    <>
      <tr className={periodo.qtd_ajustes > 0 ? 'comissao-row-com-ajuste' : ''}>
        <td><strong>{PERFIL_LABEL[periodo.perfil_comissao]}</strong></td>
        <td>{periodo.mes_label}/{periodo.ano}</td>
        <td><strong>{formatCurrency(periodo.valor_devido)}</strong></td>
        <td>
          {periodo.perfil_comissao === 'vendedor' ? (
            <>
              <strong>{periodo.valor_por_vendedora != null ? formatCurrency(periodo.valor_por_vendedora) : '—'}</strong>
              {periodo.qtd_vendedoras > 0 && (
                <div className="hint-text">÷ {periodo.qtd_vendedoras} vendedora(s)</div>
              )}
            </>
          ) : (
            <span className="hint-text">—</span>
          )}
        </td>
        <td>{formatCurrency(periodo.valor_pago)}</td>
        <td><SaldoValor valor={periodo.saldo_acumulado} /></td>
        <td>
          {periodo.qtd_ajustes > 0 ? (
            <button type="button" className="btn btn-link btn-sm" onClick={() => onExpandir(periodo)}>
              {periodo.qtd_ajustes} ajuste(s)
            </button>
          ) : (
            <span className="hint-text">—</span>
          )}
        </td>
        <td>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onRegistrar(periodo)}
          >
            Registrar pagamento
          </button>
        </td>
      </tr>
      {expandido && (
        <tr className="comissao-detalhe-row">
          <td colSpan={8}>
            <div className="comissao-periodo-detalhe">
              {periodo.perfil_comissao === 'vendedor' && periodo.qtd_vendedoras > 0 && (
                <div className="comissao-divisao-vendedoras">
                  <h4>Divisão entre vendedoras</h4>
                  <p className="hint-text">
                    Total de {formatCurrency(periodo.valor_devido)} dividido igualmente entre{' '}
                    {periodo.qtd_vendedoras} vendedora(s)
                    {periodo.valor_por_vendedora != null
                      ? ` — ${formatCurrency(periodo.valor_por_vendedora)} cada`
                      : ''}.
                    Vendedor projetista não entra neste cálculo.
                  </p>
                  {periodo.vendedoras_nomes?.length > 0 && (
                    <p className="hint-text">
                      Vendedoras: {periodo.vendedoras_nomes.join(', ')}
                    </p>
                  )}
                </div>
              )}
              {periodo.pagamentos?.length > 0 && (
                <div className="comissao-pagamentos-lista">
                  <h4>Pagamentos registrados</h4>
                  <table className="comissao-subtable">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Valor</th>
                        <th>Forma</th>
                        <th>Devido na ocasião</th>
                        <th>Obs.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {periodo.pagamentos.map((p) => (
                        <tr key={p.id}>
                          <td>{formatDate(p.data_pagamento)}</td>
                          <td>{formatCurrency(p.valor_pago)}</td>
                          <td>{p.forma_pagamento || p.forma_pagamento_nome || '—'}</td>
                          <td>
                            {p.valor_devido_na_ocasiao != null
                              ? formatCurrency(p.valor_devido_na_ocasiao)
                              : '—'}
                          </td>
                          <td>{p.observacoes || '—'}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-danger"
                              onClick={() => onExcluirPagamento(p.id)}
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="comissao-ajustes-lista">
                <h4>Ajustes que alteraram o total devido</h4>
                {loadingAjustes ? (
                  <p className="hint-text">Carregando ajustes...</p>
                ) : ajustes.length === 0 ? (
                  <p className="hint-text">Nenhum ajuste registrado para este período.</p>
                ) : (
                  <table className="comissao-subtable">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Origem</th>
                        <th>Descrição</th>
                        <th>Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ajustes.map((a) => (
                        <tr key={a.id}>
                          <td>{formatDate(a.criado_em)}</td>
                          <td>{MOTIVO_LABEL[a.motivo] || a.motivo}</td>
                          <td>{a.descricao}</td>
                          <td className={a.diferenca < 0 ? 'comissao-saldo-debito' : a.diferenca > 0 ? 'comissao-saldo-credito' : ''}>
                            {formatCurrency(a.diferenca)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ControleComissoes() {
  const anoAtual = new Date().getFullYear();
  const [aba, setAba] = useState('soltos');
  const [ano, setAno] = useState(anoAtual);
  const [perfilComissao, setPerfilComissao] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [vendedores, setVendedores] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [mensal, setMensal] = useState({ resumo: null, periodos: [] });
  const [expandidoKey, setExpandidoKey] = useState(null);
  const [ajustesExpandidos, setAjustesExpandidos] = useState([]);
  const [loadingAjustes, setLoadingAjustes] = useState(false);
  const [modalPeriodo, setModalPeriodo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { success: showSuccess } = useFeedback();

  const loadMensal = async () => {
    setLoading(true);
    setError('');
    try {
      setMensal(await api.getControleMensalComissoes({ ano }));
      setExpandidoKey(null);
      setAjustesExpandidos([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.listFormasPagamento().then(setFormasPagamento).catch(() => {});
    api.listVendedores('', 'planejados').then(setVendedores).catch(() => {});
  }, []);

  useEffect(() => {
    if (aba === 'soltos') loadMensal();
  }, [ano, aba]);

  const expandirPeriodo = async (periodo) => {
    const key = `${periodo.ano}-${periodo.mes}-${periodo.perfil_comissao}`;
    if (expandidoKey === key) {
      setExpandidoKey(null);
      setAjustesExpandidos([]);
      return;
    }
    setExpandidoKey(key);
    setLoadingAjustes(true);
    try {
      setAjustesExpandidos(await api.listAjustesComissaoMes({
        ano: periodo.ano,
        mes: periodo.mes,
        perfilComissao: periodo.perfil_comissao,
      }));
    } catch (err) {
      setError(err.message);
      setAjustesExpandidos([]);
    } finally {
      setLoadingAjustes(false);
    }
  };

  const excluirPagamento = async (id) => {
    if (!window.confirm('Excluir este registro de pagamento?')) return;
    setError('');
    try {
      await api.excluirPagamentoComissao(id);
      showSuccess('Pagamento excluído.');
      await loadMensal();
    } catch (err) {
      setError(err.message);
    }
  };

  const periodosFiltrados = useMemo(() => {
    const lista = perfilComissao
      ? (mensal.periodos || []).filter((p) => p.perfil_comissao === perfilComissao)
      : (mensal.periodos || []);
    return [...lista].sort((a, b) => {
      if (b.mes !== a.mes) return b.mes - a.mes;
      if (a.perfil_comissao === b.perfil_comissao) return 0;
      return a.perfil_comissao === 'vendedor' ? -1 : 1;
    });
  }, [mensal.periodos, perfilComissao]);

  const resumo = mensal.resumo;
  const saldoEmDia = resumo
    && Math.abs(resumo.saldo_vendedor) < 0.01
    && Math.abs(resumo.saldo_gerente) < 0.01;

  return (
    <>
      <header className="page-header visao-vendas-header">
        <div>
          <h2>Controle de comissões</h2>
          <p>
            Acompanhe comissões devidas e pagas por mês — móveis soltos (por perfil)
            ou planejados (por vendedor e faixa de vendas).
          </p>
        </div>
        <div className="visao-vendas-header-actions">
          <Link to={`${VENDAS_BASE}/regras-comissao`} className="btn btn-secondary">
            Regras — soltos
          </Link>
          <Link to={`${VENDAS_BASE}/regras-comissao-planejados`} className="btn btn-secondary">
            Regras — planejados
          </Link>
        </div>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="comissao-tabs">
        <button type="button" className={`comissao-tab ${aba === 'soltos' ? 'active' : ''}`} onClick={() => setAba('soltos')}>
          Móveis soltos
        </button>
        <button type="button" className={`comissao-tab ${aba === 'planejados' ? 'active' : ''}`} onClick={() => setAba('planejados')}>
          Planejados
        </button>
      </div>

      <div className="card visao-filtros-card">
        <div className="card-body">
          <form
            className="visao-filtros-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (aba === 'soltos') loadMensal();
            }}
          >
            <div className="visao-filtros-row">
              <div className="form-group">
                <label htmlFor="com-ano">Ano</label>
                <input
                  id="com-ano"
                  type="number"
                  className="form-control"
                  min="2020"
                  max="2100"
                  value={ano}
                  onChange={(e) => setAno(Number(e.target.value))}
                />
              </div>
              {aba === 'soltos' ? (
                <div className="form-group">
                  <label htmlFor="com-perfil">Perfil</label>
                  <select
                    id="com-perfil"
                    className="form-control"
                    value={perfilComissao}
                    onChange={(e) => setPerfilComissao(e.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="vendedor">Vendedor</option>
                    <option value="gerente">Gerente</option>
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label htmlFor="com-vendedor-pl">Vendedor</label>
                  <select
                    id="com-vendedor-pl"
                    className="form-control"
                    value={vendedorId}
                    onChange={(e) => setVendedorId(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>{v.nome}</option>
                    ))}
                  </select>
                </div>
              )}
              {aba === 'soltos' && (
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Atualizando...' : 'Atualizar'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {aba === 'planejados' ? (
        <ControleComissoesPlanejadosTab
          ano={ano}
          vendedorId={vendedorId}
          formasPagamento={formasPagamento}
          onError={setError}
        />
      ) : loading ? (
        <div className="loading">Carregando...</div>
      ) : (
        <>
          {resumo && (
            <>
              {resumo.aviso_gerente && (
                <PageAlert type="warning" showToast={false}>{resumo.aviso_gerente}</PageAlert>
              )}
              {resumo.aviso_vendedoras && (
                <PageAlert type="warning" showToast={false}>{resumo.aviso_vendedoras}</PageAlert>
              )}
            <div className="comissao-saldo-total-card">
              <div className="comissao-saldo-total-header">
                <h3>Saldo total a corrigir</h3>
                <span className={saldoEmDia ? 'comissao-saldo-zerado' : 'comissao-saldo-pendente'}>
                  {saldoEmDia ? 'Comissões em dia' : 'Ajuste necessário'}
                </span>
              </div>
              <div className="stats-grid visao-vendas-stats comissao-saldo-total-grid">
                <div className={`stat-card ${Math.abs(resumo.saldo_vendedor) >= 0.01 ? 'stat-card-priority' : ''}`}>
                  <div className="label">Saldo total — Vendedores</div>
                  <div className="value"><SaldoValor valor={resumo.saldo_vendedor} showLabel={false} /></div>
                  <div className="hint-text">Pago − devido (acumulado no ano)</div>
                </div>
                <div className={`stat-card ${Math.abs(resumo.saldo_gerente) >= 0.01 ? 'stat-card-priority' : ''}`}>
                  <div className="label">Saldo total — Gerência</div>
                  <div className="value"><SaldoValor valor={resumo.saldo_gerente} showLabel={false} /></div>
                  <div className="hint-text">Pago − devido (acumulado no ano)</div>
                </div>
                <div className="stat-card">
                  <div className="label">Devido — Gerência (ano)</div>
                  <div className="value">{formatCurrency(resumo.total_devido_gerente_ano || 0)}</div>
                  <div className="hint-text">{resumo.qtd_lancamentos_gerente || 0} lançamento(s)</div>
                </div>
                <div className="stat-card">
                  <div className="label">Devido — Vendedores (ano)</div>
                  <div className="value">{formatCurrency(resumo.total_devido_vendedor_ano || 0)}</div>
                  <div className="hint-text">{resumo.qtd_lancamentos_vendedor || 0} lançamento(s)</div>
                </div>
                {resumo.qtd_vendedoras_divisao > 0 && (
                  <div className="stat-card">
                    <div className="label">Média anual por vendedora</div>
                    <div className="value">
                      {resumo.valor_medio_vendedor_ano != null
                        ? formatCurrency(resumo.valor_medio_vendedor_ano)
                        : '—'}
                    </div>
                    <div className="hint-text">
                      {resumo.qtd_vendedoras_divisao} vendedora(s) — divisão igualitária
                    </div>
                  </div>
                )}
              </div>
            </div>
            </>
          )}

          <div className="card">
            <div className="card-header">
              Resumo mensal por perfil
              {resumo?.qtd_vendedoras_divisao > 0 && (
                <span className="hint-text" style={{ marginLeft: '0.75rem', fontWeight: 'normal' }}>
                  Comissão de vendedores dividida entre {resumo.qtd_vendedoras_divisao} vendedora(s)
                  (projetista não entra)
                </span>
              )}
            </div>
            <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Perfil</th>
                    <th>Mês</th>
                    <th>Devido (total)</th>
                    <th>Valor individual</th>
                    <th>Pago</th>
                    <th>Saldo total</th>
                    <th>Ajustes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {periodosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-state">
                        Nenhum lançamento de comissão para {ano}.
                      </td>
                    </tr>
                  ) : (
                    periodosFiltrados.map((p) => {
                      const key = `${p.ano}-${p.mes}-${p.perfil_comissao}`;
                      return (
                        <PeriodoRow
                          key={key}
                          periodo={p}
                          expandido={expandidoKey === key}
                          ajustes={expandidoKey === key ? ajustesExpandidos : []}
                          loadingAjustes={expandidoKey === key && loadingAjustes}
                          onRegistrar={setModalPeriodo}
                          onExpandir={expandirPeriodo}
                          onExcluirPagamento={excluirPagamento}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <PagamentoModal
        open={!!modalPeriodo}
        periodo={modalPeriodo}
        formasPagamento={formasPagamento}
        onClose={() => setModalPeriodo(null)}
        onSaved={() => {
          showSuccess('Pagamento registrado.');
          loadMensal();
        }}
      />
    </>
  );
}
