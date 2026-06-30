import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { InlineAlert } from './PageAlert';
import NumericInput from './NumericInput';
import {
  calcularSomaBoletos,
  dividirValorEntreBoletos,
  normalizarNumeroNotaFiscal,
  TOLERANCIA_BOLETOS,
  validarSomaBoletos,
} from '../constants/notaFiscal';
import { formatCurrency } from '../utils/format';

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
  const [cadastrarBoletos, setCadastrarBoletos] = useState(false);
  const [quantidadeBoletos, setQuantidadeBoletos] = useState(1);
  const [boletos, setBoletos] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listFornecedores('').then(setFornecedores).catch(() => setFornecedores([]));
  }, []);

  useEffect(() => {
    if (!cadastrarBoletos) {
      setBoletos([]);
      return;
    }
    setBoletos(dividirValorEntreBoletos(valorTotal, quantidadeBoletos));
  }, [cadastrarBoletos, quantidadeBoletos, valorTotal]);

  const somaBoletos = useMemo(() => calcularSomaBoletos(boletos), [boletos]);
  const erroBoletos = useMemo(
    () => (cadastrarBoletos ? validarSomaBoletos(valorTotal, boletos) : null),
    [cadastrarBoletos, valorTotal, boletos]
  );

  const fornecedorSelecionado = fornecedores.find((f) => String(f.id) === fornecedorId);
  const fornecedorLabel = fornecedorSelecionado?.nome || fornecedorNomeInicial || '';

  const atualizarBoleto = (index, field, value) => {
    setBoletos((prev) => prev.map((boleto, i) => (
      i === index ? { ...boleto, [field]: value } : boleto
    )));
  };

  const redistribuirBoletos = () => {
    setBoletos(dividirValorEntreBoletos(valorTotal, quantidadeBoletos));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const numeroNormalizado = normalizarNumeroNotaFiscal(numero);
      if (!fornecedorId) throw new Error('Selecione o fornecedor.');
      if ((Number(valorTotal) || 0) <= 0) throw new Error('Informe o valor total da nota fiscal.');

      const boletosPayload = cadastrarBoletos ? boletos : [];
      const erroValidacao = validarSomaBoletos(valorTotal, boletosPayload);
      if (erroValidacao) throw new Error(erroValidacao);

      const salva = await api.createNotaFiscal({
        fornecedor_id: Number(fornecedorId),
        numero: numeroNormalizado,
        valor_total: Number(valorTotal),
        observacoes,
        boletos: boletosPayload,
      });
      await onSaved(salva);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cadastrar nota fiscal</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

            <p className="hint-text" style={{ marginTop: 0 }}>
              Cadastre a nota fiscal do fornecedor. Os boletos, se informados, gerarão lançamentos
              automáticos em Pagamentos para acompanhamento financeiro.
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

            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-header">Boletos (opcional)</div>
              <div className="card-body">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={cadastrarBoletos}
                    onChange={(e) => setCadastrarBoletos(e.target.checked)}
                  />
                  {' '}Cadastrar boletos vinculados a esta nota
                </label>

                {cadastrarBoletos && (
                  <>
                    <div className="form-grid" style={{ marginTop: '1rem' }}>
                      <div className="form-group">
                        <label htmlFor="quantidade_boletos">Quantos boletos?</label>
                        <input
                          id="quantidade_boletos"
                          type="number"
                          min="1"
                          max="60"
                          value={quantidadeBoletos}
                          onChange={(e) => setQuantidadeBoletos(Math.max(1, Number(e.target.value) || 1))}
                        />
                      </div>
                      <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={redistribuirBoletos}
                        >
                          Redistribuir valor igualmente
                        </button>
                      </div>
                    </div>

                    <table style={{ marginTop: '1rem' }}>
                      <thead>
                        <tr>
                          <th>Parcela</th>
                          <th>Valor (R$)</th>
                          <th>Vencimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boletos.map((boleto, index) => (
                          <tr key={boleto.parcela}>
                            <td>{boleto.parcela}</td>
                            <td>
                              <NumericInput
                                min="0"
                                step="0.01"
                                value={boleto.valor}
                                onChange={(value) => atualizarBoleto(index, 'valor', value)}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={boleto.data_vencimento}
                                onChange={(e) => atualizarBoleto(index, 'data_vencimento', e.target.value)}
                                required
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td><strong>Soma dos boletos</strong></td>
                          <td colSpan={2}>
                            <strong>{formatCurrency(somaBoletos)}</strong>
                            {' '}
                            <span className="hint-text">
                              de {formatCurrency(valorTotal)}
                              {' '}(tolerância de R$ {TOLERANCIA_BOLETOS.toFixed(2).replace('.', ',')})
                            </span>
                            {erroBoletos && (
                              <div className="text-danger" style={{ marginTop: 4 }}>{erroBoletos}</div>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || (cadastrarBoletos && !!erroBoletos)}
            >
              {saving ? 'Salvando...' : 'Salvar nota fiscal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
