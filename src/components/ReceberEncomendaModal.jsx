import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  DESTINO_LABEL,
  FRETE_PADRAO,
  IPI_PADRAO,
  resolverCustoEsperado,
  calcularCustoRealRecebimentoPorPercentuais,
  calcularValorPercentual,
  normalizarNumeroNotaFiscal,
} from '../constants/encomenda';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS } from '../constants/estoque';
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
  const valorInicial = Number(item.custo_negociado) || 0;
  const [valorNotaUnitario, setValorNotaUnitario] = useState(valorInicial);
  const [fretePercentual, setFretePercentual] = useState(FRETE_PADRAO);
  const [ipiPercentual, setIpiPercentual] = useState(IPI_PADRAO);

  const { frete_unitario: freteUnitario, ipi_unitario: ipiUnitario, custo_real: custoRealCalculado } = useMemo(
    () => calcularCustoRealRecebimentoPorPercentuais(valorNotaUnitario, fretePercentual, ipiPercentual),
    [valorNotaUnitario, fretePercentual, ipiPercentual]
  );

  const destino = item.destino_esperado || 'estoque';
  const [modoNota, setModoNota] = useState('pesquisar');
  const [buscaNota, setBuscaNota] = useState('');
  const [notasDisponiveis, setNotasDisponiveis] = useState([]);
  const [buscandoNotas, setBuscandoNotas] = useState(false);
  const [notaSelecionada, setNotaSelecionada] = useState(null);
  const [numeroNotaFiscal, setNumeroNotaFiscal] = useState('');
  const [localizacoes, setLocalizacoes] = useState([]);
  const [localizacaoId, setLocalizacaoId] = useState('');
  const [loadingLocalizacoes, setLoadingLocalizacoes] = useState(true);
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const divergencia = custoRealCalculado - custoEsperado;
  const observacoesEncomenda = item.observacoes || item.item_observacoes || '';

  useEffect(() => {
    let cancelled = false;
    setLoadingLocalizacoes(true);
    api.listLocalizacoes()
      .then((lista) => {
        if (cancelled) return;
        const locs = Array.isArray(lista) ? lista : [];
        const ordenadas = [...locs].sort((a, b) => {
          if (a.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS) return -1;
          if (b.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS) return 1;
          return String(a.codigo).localeCompare(String(b.codigo));
        });
        setLocalizacoes(ordenadas);
        const naoAloc = ordenadas.find((l) => l.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS);
        setLocalizacaoId(naoAloc ? String(naoAloc.id) : (ordenadas[0] ? String(ordenadas[0].id) : ''));
      })
      .catch(() => {
        if (!cancelled) setLocalizacoes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLocalizacoes(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (modoNota !== 'pesquisar' || !item.fornecedor_id) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      setBuscandoNotas(true);
      api.listNotasFiscais(buscaNota.trim(), item.fornecedor_id)
        .then((lista) => {
          if (!cancelled) setNotasDisponiveis(Array.isArray(lista) ? lista : []);
        })
        .catch(() => {
          if (!cancelled) setNotasDisponiveis([]);
        })
        .finally(() => {
          if (!cancelled) setBuscandoNotas(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [modoNota, buscaNota, item.fornecedor_id]);

  const selecionarNota = (nota) => {
    setNotaSelecionada(nota);
    setNumeroNotaFiscal(nota.numero || '');
    setBuscaNota(nota.numero || '');
    setError('');
  };

  const limparNotaSelecionada = () => {
    setNotaSelecionada(null);
    setNumeroNotaFiscal('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!localizacaoId) throw new Error('Selecione a localização de alocação.');

      const payload = {
        encomenda_item_id: item.id,
        quantidade: Number(quantidade),
        valor_nota_unitario: Number(valorNotaUnitario),
        frete_unitario: freteUnitario,
        ipi_unitario: ipiUnitario,
        localizacao_id: Number(localizacaoId),
        observacoes,
      };

      if (modoNota === 'pesquisar') {
        if (!notaSelecionada?.id) {
          throw new Error('Pesquise e selecione a nota fiscal cadastrada.');
        }
        payload.nota_fiscal_id = Number(notaSelecionada.id);
        payload.numero_nota_fiscal = notaSelecionada.numero;
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
    <div className="modal-overlay">
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
              Destino definido na encomenda: {DESTINO_LABEL[destino] || destino}.
              Escolha a localização de entrada — o padrão é <strong>Não alocados</strong>.
            </p>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label htmlFor="localizacao_alocacao">Alocação (localização) *</label>
              <select
                id="localizacao_alocacao"
                value={localizacaoId}
                onChange={(e) => setLocalizacaoId(e.target.value)}
                required
                disabled={loadingLocalizacoes}
              >
                {loadingLocalizacoes ? (
                  <option value="">Carregando...</option>
                ) : (
                  localizacoes.map((loc) => (
                    <option key={loc.id} value={String(loc.id)}>
                      {loc.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS
                        ? 'Não alocado'
                        : `${loc.codigo} — ${loc.nome}`}
                    </option>
                  ))
                )}
              </select>
              <span className="hint-text">
                Se escolher um endereço definitivo, o produto já entra alocado (sem passar por Não alocados).
              </span>
            </div>

            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="card-header">Nota fiscal</div>
              <div className="card-body">
                <p className="hint-text" style={{ marginTop: 0 }}>
                  Pesquise uma nota já cadastrada ou informe o número manualmente. O recebimento é por
                  produto; a nota pode agrupar vários itens do fornecedor.
                </p>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${modoNota === 'pesquisar' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setModoNota('pesquisar');
                      limparNotaSelecionada();
                    }}
                  >
                    Pesquisar nota
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${modoNota === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setModoNota('manual');
                      limparNotaSelecionada();
                      setBuscaNota('');
                    }}
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

                {modoNota === 'pesquisar' ? (
                  <div className="form-group">
                    <label htmlFor="busca_nota_fiscal">Pesquisar nota fiscal *</label>
                    <input
                      id="busca_nota_fiscal"
                      className="search-input"
                      placeholder="Digite o número da NF..."
                      value={buscaNota}
                      onChange={(e) => {
                        setBuscaNota(e.target.value);
                        if (notaSelecionada) limparNotaSelecionada();
                      }}
                      autoComplete="off"
                    />
                    {notaSelecionada ? (
                      <div className="alert alert-success" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                        <strong>NF {notaSelecionada.numero}</strong>
                        {' — '}
                        {formatCurrency(notaSelecionada.valor_total)}
                        <button
                          type="button"
                          className="btn btn-link btn-sm"
                          style={{ marginLeft: 8 }}
                          onClick={() => {
                            limparNotaSelecionada();
                            setBuscaNota('');
                          }}
                        >
                          Trocar
                        </button>
                      </div>
                    ) : (
                      <div className="picker-table-wrap" style={{ marginTop: '0.75rem', maxHeight: 220, overflow: 'auto' }}>
                        {buscandoNotas ? (
                          <p className="hint-text">Buscando notas...</p>
                        ) : notasDisponiveis.length === 0 ? (
                          <p className="hint-text">
                            {buscaNota.trim()
                              ? 'Nenhuma nota encontrada para este fornecedor.'
                              : 'Nenhuma nota cadastrada para este fornecedor. Cadastre uma ou informe o número.'}
                          </p>
                        ) : (
                          <table className="picker-table">
                            <thead>
                              <tr>
                                <th>Número</th>
                                <th>Valor</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {notasDisponiveis.map((nota) => (
                                <tr key={nota.id}>
                                  <td><strong>{nota.numero}</strong></td>
                                  <td>{formatCurrency(nota.valor_total)}</td>
                                  <td className="picker-actions">
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-secondary"
                                      onClick={() => selecionarNota(nota)}
                                    >
                                      Selecionar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
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
                <label>Valor unitário do produto na nota *</label>
                <NumericInput
                  step="0.01"
                  min="0"
                  value={valorNotaUnitario}
                  onChange={setValorNotaUnitario}
                />
                <span className="hint-text">
                  Valor do produto na NF (sem frete/IPI). Sugestão da encomenda: {formatCurrency(valorInicial)}
                </span>
              </div>
              <div className="form-group">
                <label htmlFor="frete_pct">Frete (%) *</label>
                <NumericInput
                  id="frete_pct"
                  step="0.01"
                  min="0"
                  value={fretePercentual}
                  onChange={setFretePercentual}
                  placeholder="10"
                />
                <span className="hint-text">
                  Padrão 10% · {formatCurrency(calcularValorPercentual(valorNotaUnitario, fretePercentual))} sobre o produto
                </span>
              </div>
              <div className="form-group">
                <label htmlFor="ipi_pct">IPI (%) *</label>
                <NumericInput
                  id="ipi_pct"
                  step="0.01"
                  min="0"
                  value={ipiPercentual}
                  onChange={setIpiPercentual}
                  placeholder="3,5"
                />
                <span className="hint-text">
                  Padrão 3,5% · {formatCurrency(calcularValorPercentual(valorNotaUnitario, ipiPercentual))} sobre o produto
                </span>
              </div>
              <div className="form-group">
                <label>Custo real de chegada</label>
                <p style={{ margin: '0.35rem 0 0', fontWeight: 600 }}>
                  {formatCurrency(custoRealCalculado)}
                </p>
                <span className="hint-text">
                  Produto + frete ({fretePercentual || 0}%) + IPI ({ipiPercentual || 0}%)
                </span>
              </div>
              <div className="form-group">
                <label>Valor computado para venda (encomenda)</label>
                <p style={{ margin: '0.35rem 0 0', fontWeight: 600 }}>
                  {formatCurrency(custoEsperado)}
                </p>
                <span className="hint-text">
                  Se houver diferença, o custo do produto será corrigido e as comissões/desempenho
                  da venda serão atualizados.
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
