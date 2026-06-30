import { InlineAlert } from './PageAlert';
import { useState } from 'react';

const emptyForm = {
  nome_completo: '',
  telefone: '',
  nome_escritorio: '',
  instagram: '',
  chave_pix: '',
  observacoes: '',
};

export default function ParceiroModal({ parceiro, onClose, onSave }) {
  const [form, setForm] = useState(parceiro ? {
    nome_completo: parceiro.nome_completo,
    telefone: parceiro.telefone || '',
    nome_escritorio: parceiro.nome_escritorio || '',
    instagram: parceiro.instagram || '',
    chave_pix: parceiro.chave_pix || '',
    observacoes: parceiro.observacoes || '',
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
          <h3>{parceiro ? 'Editar parceiro' : 'Novo parceiro'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="nome_completo">Nome completo *</label>
              <input
                id="nome_completo"
                name="nome_completo"
                value={form.nome_completo}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="telefone">Telefone</label>
              <input
                id="telefone"
                name="telefone"
                value={form.telefone}
                onChange={handleChange}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="form-group">
              <label htmlFor="nome_escritorio">Nome do escritório</label>
              <input
                id="nome_escritorio"
                name="nome_escritorio"
                value={form.nome_escritorio}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="instagram">Instagram</label>
              <input
                id="instagram"
                name="instagram"
                value={form.instagram}
                onChange={handleChange}
                placeholder="@usuario ou link"
              />
            </div>
            <div className="form-group">
              <label htmlFor="chave_pix">Chave PIX</label>
              <input
                id="chave_pix"
                name="chave_pix"
                value={form.chave_pix}
                onChange={handleChange}
              />
            </div>
            <div className="form-group full-width">
              <label htmlFor="observacoes">Observação</label>
              <textarea
                id="observacoes"
                name="observacoes"
                value={form.observacoes}
                onChange={handleChange}
                rows={3}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
