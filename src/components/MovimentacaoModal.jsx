import { InlineAlert } from './PageAlert';
import { useState } from 'react';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS } from '../constants/estoque';

export default function MovimentacaoModal({
  produtos,
  localizacoes,
  localizacoesDestino,
  onClose,
  onSave,
}) {
  const destinos = localizacoesDestino || localizacoes.filter(
    (l) => l.codigo !== CODIGO_LOCALIZACAO_NAO_ALOCADOS
  );

  const [form, setForm] = useState({
    tipo: 'transferencia',
    produto_id: '',
    quantidade: '',
    localizacao_origem_id: '',
    localizacao_destino_id: '',
    motivo: '',
    usuario: 'operador',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const needsOrigem = form.tipo === 'saida' || form.tipo === 'transferencia';
  const needsDestino = form.tipo === 'entrada' || form.tipo === 'transferencia' || form.tipo === 'ajuste';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        tipo: form.tipo,
        produto_id: Number(form.produto_id),
        quantidade: Number(form.quantidade),
        localizacao_origem_id: form.localizacao_origem_id ? Number(form.localizacao_origem_id) : null,
        localizacao_destino_id: form.localizacao_destino_id ? Number(form.localizacao_destino_id) : null,
        motivo: form.motivo || null,
        usuario: form.usuario || 'operador',
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
          <h3>Nova movimentação</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          <p className="hint-text" style={{ marginBottom: '1rem' }}>
            Para produtos recém-chegados, use <strong>Alocar</strong> na seção de pendências.
            Entradas manuais não podem ir para &quot;Não alocados&quot;.
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="tipo">Tipo *</label>
              <select id="tipo" name="tipo" value={form.tipo} onChange={handleChange} required>
                <option value="transferencia">Transferência entre localizações</option>
                <option value="saida">Saída</option>
                <option value="entrada">Entrada manual</option>
                <option value="ajuste">Ajuste de inventário</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="produto_id">Produto *</label>
              <select id="produto_id" name="produto_id" value={form.produto_id} onChange={handleChange} required>
                <option value="">Selecione...</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} — {p.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="quantidade">Quantidade *</label>
              <input id="quantidade" name="quantidade" type="number" min="1" value={form.quantidade} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="usuario">Usuário</label>
              <input id="usuario" name="usuario" value={form.usuario} onChange={handleChange} />
            </div>
            {needsOrigem && (
              <div className="form-group">
                <label htmlFor="localizacao_origem_id">Localização de origem *</label>
                <select id="localizacao_origem_id" name="localizacao_origem_id" value={form.localizacao_origem_id} onChange={handleChange} required={needsOrigem}>
                  <option value="">Selecione...</option>
                  {localizacoes.map((l) => (
                    <option key={l.id} value={l.id}>{l.codigo} — {l.nome}</option>
                  ))}
                </select>
              </div>
            )}
            {needsDestino && (
              <div className="form-group">
                <label htmlFor="localizacao_destino_id">
                  {form.tipo === 'ajuste' ? 'Localização *' : 'Localização de destino *'}
                </label>
                <select id="localizacao_destino_id" name="localizacao_destino_id" value={form.localizacao_destino_id} onChange={handleChange} required={needsDestino}>
                  <option value="">Selecione...</option>
                  {destinos.map((l) => (
                    <option key={l.id} value={l.id}>{l.codigo} — {l.nome}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group full-width">
              <label htmlFor="motivo">Motivo / Observação</label>
              <textarea id="motivo" name="motivo" rows={2} value={form.motivo} onChange={handleChange} placeholder="Ex: Reposição de exposição, inventário, venda..." />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
