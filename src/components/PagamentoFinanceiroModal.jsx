import { useState } from 'react';
import { InlineAlert } from './PageAlert';
import { toInputDate } from '../utils/format';

function hojeIso() {
  return new Date().toISOString().split('T')[0];
}

const emptyForm = () => ({
  centro_custo_id: '',
  descricao: '',
  valor: 0,
  data_pagamento: hojeIso(),
  observacoes: '',
});

function buildFormFromPagamento(pagamento) {
  if (!pagamento) return emptyForm();
  return {
    centro_custo_id: pagamento.centro_custo_id ? String(pagamento.centro_custo_id) : '',
    descricao: pagamento.descricao || '',
    valor: Number(pagamento.valor) || 0,
    data_pagamento: toInputDate(pagamento.data_pagamento) || hojeIso(),
    observacoes: pagamento.observacoes || '',
  };
}

export default function PagamentoFinanceiroModal({
  pagamento,
  centrosCusto = [],
  onClose,
  onSave,
  onNovoCentroCusto,
}) {
  const [form, setForm] = useState(() => buildFormFromPagamento(pagamento));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const centrosAtivos = centrosCusto.filter((c) => c.ativo !== false);
  const centrosParaSelect = (() => {
    if (!form.centro_custo_id) return centrosAtivos;
    const id = Number(form.centro_custo_id);
    if (centrosAtivos.some((c) => c.id === id)) return centrosAtivos;
    const atual = centrosCusto.find((c) => c.id === id);
    return atual ? [...centrosAtivos, atual] : centrosAtivos;
  })();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...form,
        centro_custo_id: form.centro_custo_id ? Number(form.centro_custo_id) : null,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pagamento-financeiro-modal-title"
      >
        <div className="modal-header">
          <h3 id="pagamento-financeiro-modal-title">{pagamento ? 'Editar pagamento' : 'Novo pagamento'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="centro_custo_id">Centro de custo *</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  id="centro_custo_id"
                  name="centro_custo_id"
                  value={form.centro_custo_id}
                  onChange={handleChange}
                  required
                  style={{ flex: 1 }}
                >
                  <option value="">Selecione...</option>
                  {centrosParaSelect.map((centro) => (
                    <option key={centro.id} value={centro.id}>{centro.nome}</option>
                  ))}
                </select>
                {onNovoCentroCusto && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onNovoCentroCusto}
                  >
                    + Novo centro
                  </button>
                )}
              </div>
              {centrosAtivos.length === 0 && (
                <p className="hint-text">Cadastre um centro de custo antes de lançar pagamentos.</p>
              )}
            </div>
            <div className="form-group full-width">
              <label htmlFor="descricao">Descrição *</label>
              <input
                id="descricao"
                name="descricao"
                value={form.descricao}
                onChange={handleChange}
                placeholder="Ex: Conta de luz, frete, material de escritório..."
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="valor">Valor (R$) *</label>
              <NumericInput
                id="valor"
                min="0"
                step="0.01"
                value={form.valor}
                onChange={(value) => setForm((prev) => ({ ...prev, valor: value }))}
              />
            </div>
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
            <div className="form-group full-width">
              <label htmlFor="observacoes">Observações</label>
              <textarea
                id="observacoes"
                name="observacoes"
                value={form.observacoes}
                onChange={handleChange}
                rows={3}
                placeholder="Informações adicionais (opcional)"
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || centrosParaSelect.length === 0}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
