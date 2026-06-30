import { InlineAlert } from './PageAlert';
import { useState } from 'react';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS } from '../constants/estoque';
import { formatDateTime } from '../utils/format';

export default function AlocarProdutoModal({ item, localizacoesDestino, onClose, onConfirm }) {
  const [quantidade, setQuantidade] = useState(item.quantidade);
  const [localizacaoDestinoId, setLocalizacaoDestinoId] = useState(
    localizacoesDestino[0]?.id ? String(localizacoesDestino[0].id) : ''
  );
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const chegadaEm = item.ultimo_recebimento_em || item.atualizado_em;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onConfirm({
        produto_id: item.produto_id,
        quantidade: Number(quantidade),
        localizacao_destino_id: Number(localizacaoDestinoId),
        motivo: motivo.trim() || null,
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
          <h3>Alocar produto no estoque</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          <div className="alocacao-produto-resumo">
            <p><strong>{item.sku}</strong> — {item.produto_nome}</p>
            <p className="hint-text">
              Aguardando em <strong>{CODIGO_LOCALIZACAO_NAO_ALOCADOS}</strong>
              {chegadaEm && ` · Chegou em ${formatDateTime(chegadaEm)}`}
            </p>
            <p className="hint-text">Disponível para alocar: <strong>{item.quantidade}</strong> un.</p>
          </div>

          <div className="form-grid" style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="quantidade_alocar">Quantidade a alocar *</label>
              <input
                id="quantidade_alocar"
                type="number"
                min="1"
                max={item.quantidade}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="localizacao_destino">Localização definitiva *</label>
              <select
                id="localizacao_destino"
                value={localizacaoDestinoId}
                onChange={(e) => setLocalizacaoDestinoId(e.target.value)}
                required
              >
                <option value="">Selecione o endereço de guarda...</option>
                {localizacoesDestino.map((l) => (
                  <option key={l.id} value={l.id}>{l.codigo} — {l.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group full-width">
              <label htmlFor="motivo_alocacao">Observação (opcional)</label>
              <input
                id="motivo_alocacao"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Corredor A, exposição de vitrine..."
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !localizacaoDestinoId}>
              {saving ? 'Alocando...' : 'Confirmar alocação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
