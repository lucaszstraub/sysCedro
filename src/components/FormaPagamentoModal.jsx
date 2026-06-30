import { InlineAlert } from './PageAlert';
import { useState } from 'react';
import NumericInput from './NumericInput';

const emptyForm = {
  nome: '',
  taxa_percentual: 0,
};

export default function FormaPagamentoModal({ forma, onClose, onSave }) {
  const [form, setForm] = useState(forma ? {
    nome: forma.nome,
    taxa_percentual: Number(forma.taxa_percentual) || 0,
  } : emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{forma ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="nome">Nome *</label>
              <input
                id="nome"
                name="nome"
                value={form.nome}
                onChange={handleChange}
                placeholder="Ex: À vista, PIX, Cartão 12x..."
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="taxa_percentual">Taxa / desconto (%)</label>
              <NumericInput
                id="taxa_percentual"
                step="0.01"
                min="0"
                max="100"
                value={form.taxa_percentual}
                onChange={(value) => setForm((prev) => ({ ...prev, taxa_percentual: value }))}
              />
              <p className="hint-text">Percentual de desconto aplicado sobre o subtotal (0 = sem desconto).</p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
