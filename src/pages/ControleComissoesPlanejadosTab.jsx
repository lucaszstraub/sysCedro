import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { useFeedback } from '../context/FeedbackContext';
import { SaldoValor } from './ControleComissoesShared';

function PagamentoModalPlanejado({ open, periodo, formasPagamento, onClose, onSaved }) {
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
      await api.salvarPagamentoComissaoPlanejado({
        ano: periodo.ano,
        mes: periodo.mes,
        vendedor_id: periodo.vendedor_id,
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
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            Pagamento — {periodo.vendedor_nome} / {periodo.mes_label}/{periodo.ano}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <p className="text-danger">{error}</p>}
            <div className="comissao-pagamento-resumo">
              <div><span>Vendas no mês</span><strong>{formatCurrency(periodo.total_vendas)}</strong></div>
              <div><span>Comissão devida</span><strong>{formatCurrency(periodo.valor_devido)}</strong></div>
              <div><span>Já pago</span><strong>{formatCurrency(periodo.valor_pago)}</strong></div>
              <div><span>Sugestão para zerar</span><strong>{formatCurrency(Math.max(periodo.liquido_a_pagar, 0))}</strong></div>
            </div>
            <div className="hint-text" style={{ marginBottom: '1rem' }}>
              {periodo.percentual_ate_limite}% sobre {formatCurrency(periodo.base_ate_limite)} = {formatCurrency(periodo.valor_faixa_ate)}
              {periodo.base_acima_limite > 0 && (
                <> · {periodo.percentual_acima_limite}% sobre {formatCurrency(periodo.base_acima_limite)} = {formatCurrency(periodo.valor_faixa_acima)}</>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="pl-pag-valor">Valor pago</label>
                <input id="pl-pag-valor" type="number" min="0" step="0.01" className="form-control" value={valorPago} onChange={(e) => setValorPago(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="pl-pag-data">Data</label>
                <input id="pl-pag-data" type="date" className="form-control" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} required />
              </div>
              <div className="form-group full-width">
                <label htmlFor="pl-pag-forma">Forma de pagamento</label>
                <select id="pl-pag-forma" className="form-control" value={formaPagamentoId} onChange={(e) => setFormaPagamentoId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {formasPagamento.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Registrar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ControleComissoesPlanejadosTab({ ano, vendedorId, formasPagamento, onError }) {
  const [dados, setDados] = useState({ resumo: null, periodos: [] });
  const [expandidoKey, setExpandidoKey] = useState(null);
  const [modalPeriodo, setModalPeriodo] = useState(null);
  const [loading, setLoading] = useState(true);
  const { success: showSuccess } = useFeedback();

  const load = async () => {
    setLoading(true);
    onError('');
    try {
      setDados(await api.getControleMensalPlanejados({
        ano,
        vendedorId: vendedorId || null,
      }));
      setExpandidoKey(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [ano, vendedorId]);

  const periodos = dados.periodos || [];
  const resumo = dados.resumo;
  const saldoZerado = resumo && Math.abs(resumo.saldo_total) < 0.01;

  const excluirPagamento = async (id) => {
    if (!window.confirm('Excluir este pagamento?')) return;
    try {
      await api.excluirPagamentoComissaoPlanejado(id);
      showSuccess('Pagamento excluído.');
      await load();
    } catch (err) {
      onError(err.message);
    }
  };

  if (loading) return <div className="loading">Carregando planejados...</div>;

  return (
    <>
      {resumo && (
        <div className="comissao-saldo-total-card">
          <div className="comissao-saldo-total-header">
            <h3>Saldo total — planejados</h3>
            <span className={saldoZerado ? 'comissao-saldo-zerado' : 'comissao-saldo-pendente'}>
              {saldoZerado ? 'Em dia' : 'Ajuste necessário'}
            </span>
          </div>
          <div className="stats-grid visao-vendas-stats comissao-saldo-total-grid">
            <div className="stat-card stat-card-priority">
              <div className="label">Saldo acumulado</div>
              <div className="value"><SaldoValor valor={resumo.saldo_total} showLabel={false} /></div>
            </div>
            <div className="stat-card">
              <div className="label">Vendas no ano</div>
              <div className="value">{formatCurrency(resumo.total_vendas_ano)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Comissão devida</div>
              <div className="value">{formatCurrency(resumo.total_devido_ano)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Pago no ano</div>
              <div className="value">{formatCurrency(resumo.total_pago_ano)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">Comissão por vendedor e mês — planejados</div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Mês</th>
                <th>Vendas</th>
                <th>Devido</th>
                <th>Pago</th>
                <th>Saldo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {periodos.length === 0 ? (
                <tr><td colSpan={7} className="empty-state">Nenhuma venda planejada no período.</td></tr>
              ) : (
                periodos.map((p) => {
                  const key = `${p.ano}-${p.mes}-${p.vendedor_id}`;
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td><strong>{p.vendedor_nome}</strong><div className="hint-text">{p.qtd_vendas} venda(s)</div></td>
                        <td>{p.mes_label}/{p.ano}</td>
                        <td>{formatCurrency(p.total_vendas)}</td>
                        <td>
                          <strong>{formatCurrency(p.valor_devido)}</strong>
                          <div className="hint-text">
                            {p.percentual_ate_limite}%/{p.percentual_acima_limite}%
                          </div>
                        </td>
                        <td>{formatCurrency(p.valor_pago)}</td>
                        <td><SaldoValor valor={p.saldo_acumulado} /></td>
                        <td>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpandidoKey(expandidoKey === key ? null : key)}>
                            {expandidoKey === key ? 'Ocultar' : 'Detalhes'}
                          </button>
                          <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 4 }} onClick={() => setModalPeriodo(p)}>
                            Pagar
                          </button>
                        </td>
                      </tr>
                      {expandidoKey === key && (
                        <tr key={`${key}-det`} className="comissao-detalhe-row">
                          <td colSpan={7}>
                            <div className="comissao-periodo-detalhe">
                              <p className="hint-text">
                                Até {formatCurrency(p.valor_limite)}: {p.percentual_ate_limite}% × {formatCurrency(p.base_ate_limite)} = {formatCurrency(p.valor_faixa_ate)}
                                {p.base_acima_limite > 0 && (
                                  <> · Acima: {p.percentual_acima_limite}% × {formatCurrency(p.base_acima_limite)} = {formatCurrency(p.valor_faixa_acima)}</>
                                )}
                              </p>
                              {p.pagamentos?.length > 0 && (
                                <table className="comissao-subtable">
                                  <thead>
                                    <tr><th>Data</th><th>Valor</th><th>Forma</th><th /></tr>
                                  </thead>
                                  <tbody>
                                    {p.pagamentos.map((pag) => (
                                      <tr key={pag.id}>
                                        <td>{formatDate(pag.data_pagamento)}</td>
                                        <td>{formatCurrency(pag.valor_pago)}</td>
                                        <td>{pag.forma_pagamento || pag.forma_pagamento_nome || '—'}</td>
                                        <td>
                                          <button type="button" className="btn btn-link btn-sm text-danger" onClick={() => excluirPagamento(pag.id)}>Excluir</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PagamentoModalPlanejado
        open={!!modalPeriodo}
        periodo={modalPeriodo}
        formasPagamento={formasPagamento}
        onClose={() => setModalPeriodo(null)}
        onSaved={() => { showSuccess('Pagamento registrado.'); load(); }}
      />
    </>
  );
}
