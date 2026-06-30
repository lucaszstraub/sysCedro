import { useState } from 'react';
import { InlineAlert } from './PageAlert';

const emptyForm = {
  nome: '',
  descricao: '',
};

export default function CentroCustoModal({ centro, onClose, onSave }) {
  const [form, setForm] = useState(centro ? {
    nome: centro.nome,
    descricao: centro.descricao || '',
    ativo: centro.ativo !== false,
  } : emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
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
          <h3>{centro ? 'Editar centro de custo' : 'Novo centro de custo'}</h3>
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
                placeholder="Ex: Marketing, Operacional, Pessoal..."
                required
              />
            </div>
            <div className="form-group full-width">
              <label htmlFor="descricao">Descrição</label>
              <textarea
                id="descricao"
                name="descricao"
                value={form.descricao}
                onChange={handleChange}
                rows={3}
                placeholder="Detalhes opcionais sobre este centro de custo"
              />
            </div>
            {centro && (
              <div className="form-group full-width">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="ativo"
                    checked={form.ativo !== false}
                    onChange={handleChange}
                  />
                  {' '}Centro de custo ativo
                </label>
              </div>
            )}
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
