import { InlineAlert } from './PageAlert';
import { useState } from 'react';

const emptyForm = {
  nome: '',
  cpf_cnpj: '',
  telefone: '',
  email: '',
  endereco: '',
  cidade: '',
  estado: '',
  cep: '',
  observacoes: '',
};

export default function ClienteModal({ cliente, onClose, onSave }) {
  const [form, setForm] = useState(cliente ? {
    nome: cliente.nome,
    cpf_cnpj: cliente.cpf_cnpj || '',
    telefone: cliente.telefone || '',
    email: cliente.email || '',
    endereco: cliente.endereco || '',
    cidade: cliente.cidade || '',
    estado: cliente.estado || '',
    cep: cliente.cep || '',
    observacoes: cliente.observacoes || '',
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
          <h3>{cliente ? 'Editar cliente' : 'Novo cliente'}</h3>
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
              <label htmlFor="cpf_cnpj">CPF / CNPJ</label>
              <input id="cpf_cnpj" name="cpf_cnpj" value={form.cpf_cnpj} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="telefone">Telefone</label>
              <input id="telefone" name="telefone" value={form.telefone} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} />
            </div>
            <div className="form-group full-width">
              <label htmlFor="endereco">Endereço</label>
              <input id="endereco" name="endereco" value={form.endereco} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="cidade">Cidade</label>
              <input id="cidade" name="cidade" value={form.cidade} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="estado">Estado</label>
              <input id="estado" name="estado" maxLength={2} value={form.estado} onChange={handleChange} placeholder="SP" />
            </div>
            <div className="form-group">
              <label htmlFor="cep">CEP</label>
              <input id="cep" name="cep" value={form.cep} onChange={handleChange} />
            </div>
            <div className="form-group full-width">
              <label htmlFor="observacoes">Observações</label>
              <textarea id="observacoes" name="observacoes" rows={2} value={form.observacoes} onChange={handleChange} />
            </div>
          </div>
          <div className="form-actions">
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
