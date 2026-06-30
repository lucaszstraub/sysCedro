import { InlineAlert } from './PageAlert';
import { useState } from 'react';
import { ATRIBUICAO_OPTIONS } from '../constants/auth';

const emptyForm = {
  login: '',
  nome: '',
  senha: '',
  atribuicao: ATRIBUICAO_OPTIONS[0].value,
  ativo: true,
};

export default function UsuarioModal({ usuario, onClose, onSave }) {
  const [form, setForm] = useState(usuario ? {
    login: usuario.login,
    nome: usuario.nome,
    senha: '',
    atribuicao: usuario.atribuicao,
    ativo: usuario.ativo !== false,
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
          <h3>{usuario ? 'Editar usuário' : 'Novo usuário'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="login">Login *</label>
              <input
                id="login"
                name="login"
                value={form.login}
                onChange={handleChange}
                disabled={usuario?.is_master}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="nome">Nome *</label>
              <input id="nome" name="nome" value={form.nome} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="senha">
                Senha {usuario ? '(deixe em branco para manter)' : '*'}
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                value={form.senha}
                onChange={handleChange}
                required={!usuario}
              />
            </div>
            <div className="form-group">
              <label htmlFor="atribuicao">Atribuição *</label>
              <select
                id="atribuicao"
                name="atribuicao"
                value={form.atribuicao}
                onChange={handleChange}
                required
              >
                {ATRIBUICAO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {usuario && !usuario.is_master && (
              <div className="form-group full-width">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="ativo"
                    checked={form.ativo}
                    onChange={handleChange}
                  />
                  Usuário ativo
                </label>
              </div>
            )}
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
