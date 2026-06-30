import { useEffect, useMemo, useState } from 'react';
import { InlineAlert } from './PageAlert';
import { api } from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import ParceiroModal from './ParceiroModal';

const emptyForm = {
  parceiro_id: '',
  tipo_calculo: 'percentual',
  valor_informado: '',
  status_pagamento: 'a_pagar',
  data_pagamento: '',
  observacoes: '',
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function calcularPreview(base, tipo, valorInformado) {
  const total = Number(base) || 0;
  const informado = Number(valorInformado);
  if (!total || !informado) return 0;
  if (tipo === 'percentual') return round2(total * informado / 100);
  return round2(informado);
}

function hojeISO() {
  return new Date().toISOString().split('T')[0];
}

export default function IncentivoParceiroModal({
  mode = 'create',
  incentivo = null,
  onClose,
  onSave,
  onRemove,
}) {
  const isEdit = mode === 'edit';
  const [etapa, setEtapa] = useState(isEdit ? 'dados' : 'pedido');
  const [buscaPedido, setBuscaPedido] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [buscandoPedidos, setBuscandoPedidos] = useState(false);
  const [pedidoSelecionado, setPedidoSelecionado] = useState(isEdit ? {
    id: incentivo.venda_id,
    numero: incentivo.venda_numero,
    numero_pedido: incentivo.numero_pedido,
    cliente_nome: incentivo.cliente_nome,
    vendedor_nome: incentivo.vendedor_nome,
    total_pago: incentivo.total_pago,
    receita_itens: incentivo.receita_itens,
    criado_em: incentivo.venda_criado_em,
  } : null);

  const [parceiros, setParceiros] = useState([]);
  const [showParceiroModal, setShowParceiroModal] = useState(false);
  const [form, setForm] = useState(incentivo ? {
    parceiro_id: String(incentivo.parceiro_id),
    tipo_calculo: incentivo.tipo_calculo,
    valor_informado: String(incentivo.valor_informado),
    status_pagamento: incentivo.status_pagamento || 'a_pagar',
    data_pagamento: incentivo.data_pagamento || '',
    observacoes: incentivo.observacoes || '',
  } : emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadParceiros = async () => {
    setParceiros(await api.listParceiros(''));
  };

  useEffect(() => {
    loadParceiros().catch((err) => setError(err.message));
  }, []);

  const baseCalculo = Number(pedidoSelecionado?.total_pago) || 0;
  const valorPreview = useMemo(
    () => calcularPreview(baseCalculo, form.tipo_calculo, form.valor_informado),
    [baseCalculo, form.tipo_calculo, form.valor_informado]
  );

  const buscarPedidos = async (termo = buscaPedido) => {
    setBuscandoPedidos(true);
    setError('');
    try {
      setPedidos(await api.buscarVendasParaNovoIncentivo(termo));
    } catch (err) {
      setError(err.message);
    } finally {
      setBuscandoPedidos(false);
    }
  };

  useEffect(() => {
    if (etapa === 'pedido') {
      buscarPedidos('');
    }
  }, [etapa]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'status_pagamento' && value === 'pago' && !next.data_pagamento) {
        next.data_pagamento = hojeISO();
      }
      if (name === 'status_pagamento' && value === 'a_pagar') {
        next.data_pagamento = '';
      }
      return next;
    });
  };

  const selecionarPedido = (pedido) => {
    setPedidoSelecionado(pedido);
    setEtapa('dados');
    setError('');
  };

  const handleParceiroSave = async (data) => {
    const criado = await api.createParceiro(data);
    await loadParceiros();
    setForm((prev) => ({ ...prev, parceiro_id: String(criado.id) }));
    setShowParceiroModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pedidoSelecionado) {
      setError('Selecione um pedido de venda.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        venda_id: pedidoSelecionado.id,
        parceiro_id: Number(form.parceiro_id),
        tipo_calculo: form.tipo_calculo,
        valor_informado: Number(form.valor_informado),
        status_pagamento: form.status_pagamento,
        data_pagamento: form.status_pagamento === 'pago' ? form.data_pagamento : null,
        observacoes: form.observacoes,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError('');
    try {
      await onRemove(pedidoSelecionado.id);
    } catch (err) {
      setError(err.message);
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg incentivo-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h3>{isEdit ? 'Editar incentivo' : 'Cadastrar incentivo'}</h3>
              <p className="incentivo-modal-subtitle">
                {etapa === 'pedido'
                  ? 'Passo 1 — escolha o pedido de venda'
                  : `Passo 2 — defina parceiro, valor e pagamento${pedidoSelecionado ? ` · ${pedidoSelecionado.numero_pedido || pedidoSelecionado.numero}` : ''}`}
              </p>
            </div>
            <button type="button" className="modal-close" onClick={onClose}>&times;</button>
          </div>

          {!isEdit && (
            <div className="incentivo-steps" aria-label="Etapas">
              <button
                type="button"
                className={`incentivo-step${etapa === 'pedido' ? ' active' : ''}${pedidoSelecionado ? ' done' : ''}`}
                onClick={() => setEtapa('pedido')}
              >
                1. Pedido
              </button>
              <button
                type="button"
                className={`incentivo-step${etapa === 'dados' ? ' active' : ''}`}
                onClick={() => pedidoSelecionado && setEtapa('dados')}
                disabled={!pedidoSelecionado}
              >
                2. Incentivo
              </button>
            </div>
          )}

          {error && (
            <div className="modal-body" style={{ paddingBottom: 0 }}>
              <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>
            </div>
          )}

          {etapa === 'pedido' && (
            <div className="modal-body incentivo-pedido-step">
              <form
                className="incentivo-busca-pedido"
                onSubmit={(e) => {
                  e.preventDefault();
                  buscarPedidos();
                }}
              >
                <input
                  className="search-input"
                  placeholder="Buscar por nº do pedido, cliente ou vendedor..."
                  value={buscaPedido}
                  onChange={(e) => setBuscaPedido(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn btn-secondary" disabled={buscandoPedidos}>
                  {buscandoPedidos ? 'Buscando...' : 'Buscar'}
                </button>
              </form>

              <p className="hint-text">
                Somente pedidos confirmados ou entregues sem incentivo cadastrado.
              </p>

              <div className="incentivo-pedidos-lista">
                {buscandoPedidos ? (
                  <div className="empty-state">Buscando pedidos...</div>
                ) : pedidos.length === 0 ? (
                  <div className="empty-state">
                    Nenhum pedido disponível. Tente outro termo de busca.
                  </div>
                ) : (
                  pedidos.map((pedido) => (
                    <button
                      key={pedido.id}
                      type="button"
                      className={`incentivo-pedido-card${pedidoSelecionado?.id === pedido.id ? ' selected' : ''}`}
                      onClick={() => selecionarPedido(pedido)}
                    >
                      <div className="incentivo-pedido-card-main">
                        <strong>{pedido.numero_pedido || pedido.numero}</strong>
                        <span>{formatCurrency(pedido.total_pago)}</span>
                      </div>
                      <div className="incentivo-pedido-card-meta">
                        <span>{pedido.cliente_nome}</span>
                        <span>{formatDate(pedido.criado_em)}</span>
                      </div>
                      {pedido.vendedor_nome && (
                        <div className="hint-text">Vendedor: {pedido.vendedor_nome}</div>
                      )}
                    </button>
                  ))
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!pedidoSelecionado}
                  onClick={() => setEtapa('dados')}
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {etapa === 'dados' && pedidoSelecionado && (
            <form className="modal-body" onSubmit={handleSubmit}>
              <div className="incentivo-venda-resumo">
                <div>
                  <span className="label">Pedido</span>
                  <strong>{pedidoSelecionado.numero_pedido || pedidoSelecionado.numero}</strong>
                </div>
                <div>
                  <span className="label">Cliente</span>
                  <strong>{pedidoSelecionado.cliente_nome}</strong>
                </div>
                <div>
                  <span className="label">Total pago</span>
                  <strong>{formatCurrency(baseCalculo)}</strong>
                </div>
                <div>
                  <span className="label">Vendedor</span>
                  <strong>{pedidoSelecionado.vendedor_nome || '—'}</strong>
                </div>
              </div>

              {!isEdit && (
                <button
                  type="button"
                  className="btn btn-link btn-sm incentivo-trocar-pedido"
                  onClick={() => setEtapa('pedido')}
                >
                  Trocar pedido
                </button>
              )}

              <p className="hint-text incentivo-aviso-interno">
                Uso interno da gerência. O incentivo não aparece para o cliente nem no PDF do pedido.
              </p>

              <div className="form-grid">
                <div className="form-group full-width">
                  <div className="incentivo-parceiro-header">
                    <label htmlFor="parceiro_id">Parceiro *</label>
                    <button
                      type="button"
                      className="btn btn-link btn-sm"
                      onClick={() => setShowParceiroModal(true)}
                    >
                      + Cadastrar parceiro
                    </button>
                  </div>
                  <select
                    id="parceiro_id"
                    name="parceiro_id"
                    value={form.parceiro_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Selecione o parceiro</option>
                    {parceiros.map((parceiro) => (
                      <option key={parceiro.id} value={parceiro.id}>
                        {parceiro.nome_completo}
                        {parceiro.nome_escritorio ? ` — ${parceiro.nome_escritorio}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="tipo_calculo">Forma do incentivo *</label>
                  <select
                    id="tipo_calculo"
                    name="tipo_calculo"
                    value={form.tipo_calculo}
                    onChange={handleChange}
                  >
                    <option value="percentual">Percentual do total pago</option>
                    <option value="valor">Valor fixo (R$)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="valor_informado">
                    {form.tipo_calculo === 'percentual' ? 'Percentual (%) *' : 'Valor (R$) *'}
                  </label>
                  <input
                    id="valor_informado"
                    name="valor_informado"
                    type="number"
                    min="0"
                    step="0.01"
                    max={form.tipo_calculo === 'percentual' ? '100' : undefined}
                    value={form.valor_informado}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>Valor calculado</label>
                  <div className="incentivo-preview-valor">{formatCurrency(valorPreview)}</div>
                </div>

                <div className="form-group full-width">
                  <label>Status do pagamento *</label>
                  <div className="incentivo-status-toggle" role="radiogroup">
                    <label className={`incentivo-status-option${form.status_pagamento === 'a_pagar' ? ' active a-pagar' : ''}`}>
                      <input
                        type="radio"
                        name="status_pagamento"
                        value="a_pagar"
                        checked={form.status_pagamento === 'a_pagar'}
                        onChange={handleChange}
                      />
                      A pagar
                    </label>
                    <label className={`incentivo-status-option${form.status_pagamento === 'pago' ? ' active pago' : ''}`}>
                      <input
                        type="radio"
                        name="status_pagamento"
                        value="pago"
                        checked={form.status_pagamento === 'pago'}
                        onChange={handleChange}
                      />
                      Pago
                    </label>
                  </div>
                </div>

                {form.status_pagamento === 'pago' && (
                  <div className="form-group">
                    <label htmlFor="data_pagamento">Data do pagamento *</label>
                    <input
                      id="data_pagamento"
                      name="data_pagamento"
                      type="date"
                      value={form.data_pagamento}
                      onChange={handleChange}
                      required
                    />
                  </div>
                )}

                <div className="form-group full-width">
                  <label htmlFor="observacoes">Observação interna</label>
                  <textarea
                    id="observacoes"
                    name="observacoes"
                    value={form.observacoes}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Ex.: indicação do escritório, acordo verbal..."
                  />
                </div>
              </div>

              {incentivo?.itens?.length > 0 && (
                <details className="incentivo-itens-preview">
                  <summary>Distribuição proporcional por produto (interno)</summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Receita</th>
                        <th>Dedução</th>
                        <th>Receita líquida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incentivo.itens.map((item) => (
                        <tr key={item.venda_item_id}>
                          <td>{item.item_descricao}</td>
                          <td>{formatCurrency(item.valor_bruto)}</td>
                          <td>{formatCurrency(item.valor_deducao)}</td>
                          <td>{formatCurrency(item.valor_liquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              <div className="modal-footer incentivo-modal-footer">
                {isEdit && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleRemove}
                    disabled={saving || removing}
                  >
                    {removing ? 'Removendo...' : 'Excluir'}
                  </button>
                )}
                <div className="modal-footer-spacer" />
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving || removing}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || removing}>
                  {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar incentivo'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {showParceiroModal && (
        <ParceiroModal
          onClose={() => setShowParceiroModal(false)}
          onSave={handleParceiroSave}
        />
      )}
    </>
  );
}
