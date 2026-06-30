import { InlineAlert } from './PageAlert';
import { useState } from 'react';

const emptyForm = {
  nome: '',
  localizacao: '',
  representante_nome: '',
  representante_contato: '',
};

export default function FornecedorModal({ fornecedor, onClose, onSave }) {
  const [form, setForm] = useState(fornecedor ? {
    nome: fornecedor.nome,
    localizacao: fornecedor.localizacao || '',
    representante_nome: fornecedor.representante_nome || '',
    representante_contato: fornecedor.representante_contato || '',
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
          <h3>{fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-grid">
            <div className="form-group full-width">
              <label htmlFor="nome">Nome do fornecedor *</label>
              <input id="nome" name="nome" value={form.nome} onChange={handleChange} required />
            </div>
            <div className="form-group full-width">
              <label htmlFor="localizacao">Localização</label>
              <input
                id="localizacao"
                name="localizacao"
                value={form.localizacao}
                onChange={handleChange}
                placeholder="Cidade, estado ou região"
              />
            </div>
            <div className="form-group">
              <label htmlFor="representante_nome">Nome do representante</label>
              <input
                id="representante_nome"
                name="representante_nome"
                value={form.representante_nome}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="representante_contato">Contato do representante</label>
              <input
                id="representante_contato"
                name="representante_contato"
                value={form.representante_contato}
                onChange={handleChange}
                placeholder="Telefone, e-mail ou WhatsApp"
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
