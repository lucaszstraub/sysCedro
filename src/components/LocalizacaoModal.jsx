import { InlineAlert } from './PageAlert';
import { useEffect, useState } from 'react';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS } from '../constants/estoque';

const emptyForm = {
  codigo: '',
  nome: '',
  corredor: '',
  prateleira: '',
  capacidade: '',
};

export default function LocalizacaoModal({ localizacao, onClose, onSave }) {
  const isEdit = Boolean(localizacao);
  const isSistema = localizacao?.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS;

  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (localizacao) {
      setForm({
        codigo: localizacao.codigo || '',
        nome: localizacao.nome || '',
        corredor: localizacao.corredor || '',
        prateleira: localizacao.prateleira || '',
        capacidade: localizacao.capacidade ?? '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [localizacao]);

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
        codigo: form.codigo.trim(),
        nome: form.nome.trim(),
        corredor: form.corredor.trim() || null,
        prateleira: form.prateleira.trim() || null,
        capacidade: form.capacidade ? Number(form.capacidade) : 0,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Editar localização' : 'Nova localização'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          {isSistema && (
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              Área do sistema usada para produtos recém-recebidos. O código não pode ser alterado.
            </div>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="codigo">Código *</label>
              <input
                id="codigo"
                name="codigo"
                value={form.codigo}
                onChange={handleChange}
                required
                readOnly={isSistema}
                placeholder="Ex: A-01-03"
              />
            </div>
            <div className="form-group">
              <label htmlFor="nome">Nome *</label>
              <input id="nome" name="nome" value={form.nome} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="corredor">Corredor</label>
              <input id="corredor" name="corredor" value={form.corredor} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="prateleira">Prateleira</label>
              <input id="prateleira" name="prateleira" value={form.prateleira} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="capacidade">Capacidade (unidades)</label>
              <input
                id="capacidade"
                name="capacidade"
                type="number"
                min="0"
                value={form.capacidade}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
