import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  DESTINO_LABEL,
  resolverCustoEsperado,
  calcularFreteUnitario,
  calcularIpiUnitario,
  calcularCustoRealRecebimento,
  normalizarNumeroNotaFiscal,
} from '../constants/encomenda';
import { formatCurrency } from '../utils/format';
import NumericInput from './NumericInput';
import NumeroPedidoCell from './NumeroPedidoCell';

export default function ReceberEncomendaModal({
  item,
  onClose,
  onConfirm,
  onCadastrarNotaFiscal,
}) {
  const [quantidade, setQuantidade] = useState(item.quantidade_pendente);
  const custoEsperado = resolverCustoEsperado(item);
  const fretePct = Number(item.frete_percentual) || 10;
  const ipiPct = Number(item.ipi_percentual) || 3.25;
  const valorInicial = Number(item.custo_negociado) || 0;
  const [valorNotaUnitario, setValorNotaUnitario] = useState(valorInicial);
  const [freteUnitario, setFreteUnitario] = useState(() => calcularFreteUnitario(valorInicial, fretePct));
  const [ipiUnitario, setIpiUnitario] = useState(() => calcularIpiUnitario(valorInicial, ipiPct));
  const custoRealCalculado = useMemo(
    () => calcularCustoRealRecebimento(valorNotaUnitario, freteUnitario, ipiUnitario),
    [valorNotaUnitario, freteUnitario, ipiUnitario]
  );
  const destino = item.destino_esperado || 'estoque';
  const [modoNota, setModoNota] = useState('cadastrada');
  const [notasDisponiveis, setNotasDisponiveis] = useState([]);
  const [notaFiscalId, setNotaFiscalId] = useState('');
  const [numeroNotaFiscal, setNumeroNotaFiscal] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const divergencia = custoRealCalculado - custoEsperado;
  const observacoesEncomenda = item.observacoes || item.item_observacoes || '';

  useEffect(() => {
    if (!item.fornecedor_id) return;
    api.listNotasFiscais('', item.fornecedor_id)
      .then((lista) => {
        setNotasDisponiveis(lista);
        if (lista.length > 0) {
          setModoNota('cadastrada');
        } else {
          setModoNota('manual');
        }
      })
      .catch(() => setNotasDisponiveis([]));
  }, [item.fornecedor_id]);

  useEffect(() => {
    if (modoNota !== 'cadastrada') return;
    const nota = notasDisponiveis.find((n) => String(n.id) === notaFiscalId);
    setNumeroNotaFiscal(nota?.numero || '');
  }, [modoNota, notaFiscalId, notasDisponiveis]);

  const handleValorNotaChange = (valor) => {
    setValorNotaUnitario(valor);
    setFreteUnitario(calcularFreteUnitario(valor, fretePct));
    setIpiUnitario(calcularIpiUnitario(valor, ipiPct));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        encomenda_item_id: item.id,
        quantidade: Number(quantidade),
        valor_nota_unitario: Number(valorNotaUnitario),
        frete_unitario: Number(freteUnitario),
        ipi_unitario: Number(ipiUnitario),
        observacoes,
      };

      if (modoNota === 'cadastrada') {
        if (!notaFiscalId) throw new Error('Selecione a nota fiscal cadastrada.');
        payload.nota_fiscal_id = Number(notaFiscalId);
        payload.numero_nota_fiscal = numeroNotaFiscal;
      } else {
        payload.numero_nota_fiscal = normalizarNumeroNotaFiscal(numeroNotaFiscal);
      }

      await onConfirm(payload);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Receber item de encomenda</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

            <p><strong>{item.produto_sku}</strong> — {item.produto_nome}</p>
            <p className="hint-text" style={{ marginBottom: '0.5rem' }}>
              Encomenda {item.encomenda_numero} · Fornecedor: {item.fornecedor_nome}
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              {item.venda_numero || item.numero_pedido ? (
                <NumeroPedidoCell
                  numeroPedido={item.numero_pedido}
                  clienteNome={item.cliente_nome}
                  vendaNumero={item.venda_numero}
                />
              ) : (
                <strong className="pedido-estoque-label">Estoque</strong>
              )}
            </div>

            {observacoesEncomenda ? (
              <div className="alert alert-info" style={{ marginBottom: '0.75rem' }}>
                <strong>Observações do produto na encomenda</strong>
                <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>{observacoesEncomenda}</p>
              </div>
            ) : (
              <p className="hint-text" style={{ marginBottom: '0.75rem' }}>
                Sem observações registradas na encomenda para este produto.
              </p>
            )}

            <p className="hint-text" style={{ marginBottom: 0 }}>
              Destino definido na encomenda: {DESTINO_LABEL[destino] || destino}
              {' · '}O produto será alocado em <strong>Não alocados</strong> para guarda posterior no WMS.
            </p>

            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-header">Nota fiscal</div>
              <div className="card-body">
                <p className="hint-text" style={{ marginTop: 0 }}>
                  Vincule uma nota já cadastrada ou informe o número manualmente. O recebimento é por
                  produto; a nota pode agrupar vários itens do fornecedor.
                </p>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${modoNota === 'cadastrada' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setModoNota('cadastrada')}
                    disabled={notasDisponiveis.length === 0}
                  >
                    Nota cadastrada
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${modoNota === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setModoNota('manual')}
                  >
                    Informar número
                  </button>
                  {onCadastrarNotaFiscal && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onCadastrarNotaFiscal(item)}
                    >
                      + Cadastrar nota fiscal
                    </button>
                  )}
                </div>

                {modoNota === 'cadastrada' ? (
                  <div className="form-group">
                    <label htmlFor="nota_fiscal_id">Selecione a nota fiscal *</label>
                    <select
                      id="nota_fiscal_id"
                      value={notaFiscalId}
                      onChange={(e) => setNotaFiscalId(e.target.value)}
                      required
                    >
                      <option value="">Selecione...</option>
                      {notasDisponiveis.map((nota) => (
                        <option key={nota.id} value={nota.id}>
                          NF {nota.numero} — {formatCurrency(nota.valor_total)}
                        </option>
                      ))}
                    </select>
                    {notasDisponiveis.length === 0 && (
                      <p className="hint-text">Nenhuma nota cadastrada para este fornecedor.</p>
                    )}
                  </div>
                ) : (
                  <div className="form-group">
                    <label htmlFor="numero_nota_fiscal">Número da nota fiscal *</label>
                    <input
                      id="numero_nota_fiscal"
                      inputMode="numeric"
                      pattern="\d+"
                      placeholder="Somente dígitos"
                      value={numeroNotaFiscal}
                      onChange={(e) => setNumeroNotaFiscal(e.target.value.replace(/\D/g, ''))}
                      required
                      style={{ maxWidth: 220 }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label>Quantidade a receber *</label>
                <input
                  type="number"
                  min="1"
                  max={item.quantidade_pendente}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  required
                />
                <span className="hint-text">Pendente: {item.quantidade_pendente}</span>
              </div>
              <div className="form-group">
                <label>Valor unitário na nota *</label>
                <NumericInput
                  step="0.01"
                  min="0"
                  value={valorNotaUnitario}
                  onChange={handleValorNotaChange}
                />
                <span className="hint-text">
                  Sugestão da encomenda: frete {fretePct}% · IPI {ipiPct}%
                </span>
              </div>
              <div className="form-group">
                <label>Frete unitário (nota) *</label>
                <NumericInput
                  step="0.01"
                  min="0"
                  value={freteUnitario}
                  onChange={setFreteUnitario}
                />
              </div>
              <div className="form-group">
                <label>IPI unitário (nota) *</label>
                <NumericInput
                  step="0.01"
                  min="0"
                  value={ipiUnitario}
                  onChange={setIpiUnitario}
                />
              </div>
              <div className="form-group">
                <label>Custo real de chegada</label>
                <p style={{ margin: '0.35rem 0 0', fontWeight: 600 }}>
                  {formatCurrency(custoRealCalculado)}
                </p>
                <span className="hint-text">
                  Valor na nota + frete + IPI
                </span>
              </div>
              <div className="form-group">
                <label>Custo esperado na encomenda</label>
                <p style={{ margin: '0.35rem 0 0', fontWeight: 600 }}>
                  {formatCurrency(custoEsperado)}
                </p>
                <span className="hint-text">
                  Produto {formatCurrency(item.custo_negociado)}
                  {' + '}frete {formatCurrency(calcularFreteUnitario(item.custo_negociado, fretePct))}
                  {' + '}IPI {formatCurrency(calcularIpiUnitario(item.custo_negociado, ipiPct))}
                  {divergencia !== 0 && (
                    <span className={divergencia > 0 ? 'text-danger' : 'text-success'}>
                      {' · '}Divergência: {formatCurrency(divergencia)}
                    </span>
                  )}
                  {divergencia === 0 && (
                    <span className="text-success"> · Confere com a encomenda</span>
                  )}
                </span>
              </div>
              <div className="form-group full-width">
                <label>Observações do recebimento</label>
                <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Registrando...' : 'Confirmar recebimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
