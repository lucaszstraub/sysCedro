import { InlineAlert } from './PageAlert';
import { useState } from 'react';
import {
  VENDEDOR_CLASSIFICACAO_MOVEIS_SOLTOS,
  VENDEDOR_CLASSIFICACAO_OPTIONS,
} from '../constants/vendedor';

const emptyForm = {
  nome: '',
  email: '',
  telefone: '',
  classificacao: VENDEDOR_CLASSIFICACAO_MOVEIS_SOLTOS,
};

export default function VendedorModal({
  vendedor,
  classificacaoPadrao = VENDEDOR_CLASSIFICACAO_MOVEIS_SOLTOS,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(vendedor ? {
    nome: vendedor.nome,
    email: vendedor.email || '',
    telefone: vendedor.telefone || '',
    classificacao: vendedor.classificacao || classificacaoPadrao,
  } : { ...emptyForm, classificacao: classificacaoPadrao });
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
          <h3>{vendedor ? 'Editar vendedor' : 'Novo vendedor'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="nome">Nome *</label>
              <input id="nome" name="nome" value={form.nome} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="classificacao">Classificação *</label>
              <select
                id="classificacao"
                name="classificacao"
                value={form.classificacao}
                onChange={handleChange}
                required
              >
                {VENDEDOR_CLASSIFICACAO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="telefone">Telefone</label>
              <input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
