import { useEffect, useState } from 'react';
import { api } from '../api';
import { InlineAlert } from './PageAlert';
import NumericInput from './NumericInput';
import { normalizarNumeroNotaFiscal } from '../constants/notaFiscal';

export default function NotaFiscalModal({
  fornecedorIdInicial = '',
  fornecedorNomeInicial = '',
  onClose,
  onSaved,
}) {
  const [fornecedores, setFornecedores] = useState([]);
  const [fornecedorId, setFornecedorId] = useState(fornecedorIdInicial ? String(fornecedorIdInicial) : '');
  const [numero, setNumero] = useState('');
  const [valorTotal, setValorTotal] = useState(0);
  const [observacoes, setObservacoes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listFornecedores('').then(setFornecedores).catch(() => setFornecedores([]));
  }, []);

  const fornecedorSelecionado = fornecedores.find((f) => String(f.id) === fornecedorId);
  const fornecedorLabel = fornecedorSelecionado?.nome || fornecedorNomeInicial || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const numeroNormalizado = normalizarNumeroNotaFiscal(numero);
      if (!fornecedorId) throw new Error('Selecione o fornecedor.');
      if ((Number(valorTotal) || 0) <= 0) throw new Error('Informe o valor total da nota fiscal.');

      const salva = await api.createNotaFiscal({
        fornecedor_id: Number(fornecedorId),
        numero: numeroNormalizado,
        valor_total: Number(valorTotal),
        observacoes,
        boletos: [],
      });
      await onSaved(salva);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cadastrar nota fiscal</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

            <p className="hint-text" style={{ marginTop: 0 }}>
              Cadastre a nota fiscal do fornecedor para vincular aos recebimentos.
            </p>

            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="fornecedor_id">Fornecedor *</label>
                <select
                  id="fornecedor_id"
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  required
                  disabled={!!fornecedorIdInicial}
                >
                  <option value="">Selecione...</option>
                  {fornecedores.map((fornecedor) => (
                    <option key={fornecedor.id} value={fornecedor.id}>{fornecedor.nome}</option>
                  ))}
                </select>
                {fornecedorIdInicial && fornecedorLabel && (
                  <span className="hint-text">Fornecedor vinculado ao recebimento: {fornecedorLabel}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="numero_nf">Número da nota fiscal *</label>
                <input
                  id="numero_nf"
                  inputMode="numeric"
                  pattern="\d+"
                  placeholder="Somente dígitos"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="valor_total_nf">Valor total da nota (R$) *</label>
                <NumericInput
                  id="valor_total_nf"
                  min="0"
                  step="0.01"
                  value={valorTotal}
                  onChange={setValorTotal}
                />
              </div>

              <div className="form-group full-width">
                <label htmlFor="observacoes_nf">Observações</label>
                <textarea
                  id="observacoes_nf"
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar nota fiscal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
