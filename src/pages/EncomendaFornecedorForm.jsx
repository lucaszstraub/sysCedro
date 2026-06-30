import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import {
  STATUS_OPTIONS,
  PRAZO_ENTREGA_OPCOES,
  FRETE_PADRAO,
  IPI_PADRAO,
  calcularCustoComImpostos,
  calcularDataPrevisaoEntrega,
  resolverPrazoDias,
} from '../constants/encomenda';
import { formatCurrency, formatDate, toInputDate } from '../utils/format';
import NumericInput from '../components/NumericInput';
import SelecionarItensVendaModal from '../components/SelecionarItensVendaModal';
import SelecionarProdutoModal from '../components/SelecionarProdutoModal';
import NumeroPedidoCell from '../components/NumeroPedidoCell';
import PageAlert from '../components/PageAlert';
import ConfirmarSaidaModal from '../components/ConfirmarSaidaModal';
import { useFeedback } from '../context/FeedbackContext';

const listPath = '/gestao-estoque/encomendas';

function emptyItem(prazoDias = 30) {
  return {
    key: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    produto_id: null,
    produto_nome: '',
    produto_sku: '',
    quantidade_pedida: 1,
    custo_negociado: 0,
    previsao_entrega_dias: prazoDias,
    destino_esperado: 'estoque',
    observacoes: '',
    can_remove: true,
  };
}

function mapItemFromDb(item) {
  return {
    key: `item_${item.id}`,
    id: item.id,
    venda_item_id: item.venda_item_id,
    venda_id: item.venda_id,
    produto_id: item.produto_id,
    produto_nome: item.produto_nome,
    produto_sku: item.produto_sku,
    quantidade_pedida: item.quantidade_pedida,
    quantidade_recebida: item.quantidade_recebida,
    quantidade_pendente_max: item.quantidade_pedida,
    custo_negociado: Number(item.custo_negociado),
    previsao_entrega_dias: item.previsao_entrega_dias || 30,
    previsao_entrega: item.previsao_entrega,
    destino_esperado: item.destino_esperado,
    observacoes: item.observacoes || '',
    status: item.status,
    venda_numero: item.venda_numero,
    numero_pedido: item.numero_pedido,
    cliente_nome: item.cliente_nome,
    readonly_destino: Boolean(item.venda_item_id),
    can_remove: !Number(item.quantidade_recebida),
  };
}

function mapPendenciaToItem(p, prazoDias) {
  return {
    key: `venda_new_${p.venda_item_id}`,
    venda_item_id: p.venda_item_id,
    venda_id: p.venda_id,
    produto_id: p.produto_id,
    produto_nome: p.produto_nome || p.item_descricao,
    produto_sku: p.produto_sku,
    quantidade_pedida: p.quantidade_pendente,
    quantidade_pendente_max: p.quantidade_pendente,
    custo_negociado: Number(p.preco_custo) || 0,
    previsao_entrega_dias: prazoDias,
    destino_esperado: 'cliente',
    observacoes: '',
    venda_numero: p.venda_numero,
    numero_pedido: p.numero_pedido,
    cliente_nome: p.cliente_nome,
    readonly_destino: true,
    can_remove: true,
  };
}

function itemSnapshot(item) {
  return {
    id: item.id || null,
    venda_item_id: item.venda_item_id || null,
    produto_id: item.produto_id,
    quantidade_pedida: Number(item.quantidade_pedida) || 0,
    custo_negociado: Number(item.custo_negociado) || 0,
    previsao_entrega_dias: Number(item.previsao_entrega_dias) || 0,
    destino_esperado: item.destino_esperado || 'estoque',
    observacoes: (item.observacoes || '').trim(),
  };
}

function buildEncomendaSnapshot({
  fornecedorId,
  status,
  dataPedido,
  prazoOpcao,
  prazoCustomDias,
  fretePercentual,
  ipiPercentual,
  observacoes,
  itens,
}) {
  return JSON.stringify({
    fornecedorId: String(fornecedorId || ''),
    status: status || 'rascunho',
    dataPedido: dataPedido || '',
    prazoOpcao: String(prazoOpcao || ''),
    prazoCustomDias: String(prazoCustomDias || ''),
    fretePercentual: Number(fretePercentual) || 0,
    ipiPercentual: Number(ipiPercentual) || 0,
    observacoes: (observacoes || '').trim(),
    itens: [...itens.map(itemSnapshot)].sort((a, b) => {
      const keyA = `${a.venda_item_id || ''}-${a.produto_id || ''}-${a.id || ''}`;
      const keyB = `${b.venda_item_id || ''}-${b.produto_id || ''}-${b.id || ''}`;
      return keyA.localeCompare(keyB);
    }),
  });
}

function snapshotFromEncomenda(enc) {
  const dias = Number(enc.previsao_entrega_dias) || 30;
  const prazoOpcao = PRAZO_ENTREGA_OPCOES.includes(dias) ? String(dias) : 'custom';
  return buildEncomendaSnapshot({
    fornecedorId: String(enc.fornecedor_id),
    status: enc.status,
    dataPedido: toInputDate(enc.data_pedido),
    prazoOpcao,
    prazoCustomDias: prazoOpcao === 'custom' ? String(dias) : '',
    fretePercentual: Number(enc.frete_percentual ?? FRETE_PADRAO),
    ipiPercentual: Number(enc.ipi_percentual ?? IPI_PADRAO),
    observacoes: enc.observacoes || '',
    itens: (enc.itens || []).map(mapItemFromDb),
  });
}

export default function EncomendaFornecedorForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [fornecedores, setFornecedores] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState('');
  const { confirm, success: showSuccess, runWithFeedback } = useFeedback();
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [showVendaModal, setShowVendaModal] = useState(false);
  const [removedVendaItemIds, setRemovedVendaItemIds] = useState([]);

  const [numero, setNumero] = useState('');
  const [fornecedorId, setFornecedorId] = useState(searchParams.get('fornecedor') || '');
  const [status, setStatus] = useState('rascunho');
  const [dataPedido, setDataPedido] = useState(toInputDate(new Date()));
  const [prazoOpcao, setPrazoOpcao] = useState('30');
  const [prazoCustomDias, setPrazoCustomDias] = useState('');
  const [fretePercentual, setFretePercentual] = useState(FRETE_PADRAO);
  const [ipiPercentual, setIpiPercentual] = useState(IPI_PADRAO);
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState([]);
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [exitPrompt, setExitPrompt] = useState(null);
  const isDirtyRef = useRef(false);
  const skipLoadRef = useRef(false);

  const prazoDiasPedido = useMemo(
    () => resolverPrazoDias(prazoOpcao, prazoCustomDias),
    [prazoOpcao, prazoCustomDias]
  );

  const dataPrevisaoPedido = useMemo(
    () => calcularDataPrevisaoEntrega(prazoDiasPedido, dataPedido),
    [prazoDiasPedido, dataPedido]
  );

  const itensManuais = useMemo(() => itens.filter((i) => !i.venda_item_id), [itens]);
  const itensVenda = useMemo(() => itens.filter((i) => i.venda_item_id), [itens]);
  const temRecebimento = useMemo(
    () => itens.some((i) => Number(i.quantidade_recebida) > 0),
    [itens]
  );

  const custoParaItem = (item) => calcularCustoComImpostos(
    item.custo_negociado,
    fretePercentual,
    ipiPercentual
  );

  const dataPrevisaoItem = (item) => calcularDataPrevisaoEntrega(
    item.previsao_entrega_dias || prazoDiasPedido,
    dataPedido
  );

  const currentSnapshot = useMemo(
    () => buildEncomendaSnapshot({
      fornecedorId,
      status,
      dataPedido,
      prazoOpcao,
      prazoCustomDias,
      fretePercentual,
      ipiPercentual,
      observacoes,
      itens,
    }),
    [
      fornecedorId,
      status,
      dataPedido,
      prazoOpcao,
      prazoCustomDias,
      fretePercentual,
      ipiPercentual,
      observacoes,
      itens,
    ]
  );

  const isDirty = baselineSnapshot !== null && currentSnapshot !== baselineSnapshot;

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const hydrateFromEncomenda = (enc) => {
    setNumero(enc.numero);
    setFornecedorId(String(enc.fornecedor_id));
    setStatus(enc.status);
    setDataPedido(toInputDate(enc.data_pedido));
    setFretePercentual(Number(enc.frete_percentual ?? FRETE_PADRAO));
    setIpiPercentual(Number(enc.ipi_percentual ?? IPI_PADRAO));
    setObservacoes(enc.observacoes || '');

    const dias = Number(enc.previsao_entrega_dias) || 30;
    if (PRAZO_ENTREGA_OPCOES.includes(dias)) {
      setPrazoOpcao(String(dias));
      setPrazoCustomDias('');
    } else {
      setPrazoOpcao('custom');
      setPrazoCustomDias(String(dias));
    }

    setItens((enc.itens || []).map(mapItemFromDb));
    setRemovedVendaItemIds([]);
  };

  useEffect(() => {
    (async () => {
      if (skipLoadRef.current) {
        skipLoadRef.current = false;
        return;
      }
      try {
        const f = await api.listFornecedores();
        setFornecedores(f);
        if (!isNew) {
          const enc = await api.getEncomendaFornecedor(Number(id));
          hydrateFromEncomenda(enc);
          setBaselineSnapshot(snapshotFromEncomenda(enc));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  useEffect(() => {
    if (!loading && isNew && baselineSnapshot === null) {
      setBaselineSnapshot(currentSnapshot);
    }
  }, [loading, isNew, baselineSnapshot, currentSnapshot]);

  const addProduto = (produto) => {
    if (fornecedorId && produto.fornecedor_id && String(produto.fornecedor_id) !== String(fornecedorId)) {
      setError('Este produto pertence a outro fornecedor. Selecione um produto do fornecedor da encomenda.');
      return;
    }
    setItens((prev) => [...prev, {
      ...emptyItem(prazoDiasPedido),
      produto_id: produto.id,
      produto_nome: produto.nome,
      produto_sku: produto.sku,
      custo_negociado: Number(produto.preco_custo) || 0,
    }]);
    setShowProdutoModal(false);
    setError('');
  };

  const addItensVenda = (pendencias) => {
    setItens((prev) => {
      const existentes = new Set(prev.map((i) => i.venda_item_id).filter(Boolean));
      const novos = pendencias
        .filter((p) => !existentes.has(p.venda_item_id))
        .map((p) => mapPendenciaToItem(p, prazoDiasPedido));
      if (novos.length > 0) {
        showSuccess(`${novos.length} item(ns) de venda vinculado(s) à encomenda.`);
      }
      return [...prev, ...novos];
    });
    setError('');
  };

  const updateItem = (key, field, value) => {
    setItens((prev) => prev.map((item) => (
      item.key === key ? { ...item, [field]: value } : item
    )));
  };

  const removeItem = (key) => {
    setItens((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item?.id && item.venda_item_id) {
        setRemovedVendaItemIds((ids) => [...ids, item.id]);
      }
      return prev.filter((i) => i.key !== key);
    });
  };

  const aplicarPrazoATodos = () => {
    setItens((prev) => prev.map((item) => ({
      ...item,
      previsao_entrega_dias: prazoDiasPedido,
    })));
  };

  const mapItemPayload = (i) => ({
    id: i.id || null,
    venda_item_id: i.venda_item_id || null,
    venda_id: i.venda_id || null,
    produto_id: i.produto_id,
    quantidade_pedida: Number(i.quantidade_pedida),
    custo_negociado: Number(i.custo_negociado),
    previsao_entrega_dias: Number(i.previsao_entrega_dias) || prazoDiasPedido,
    previsao_entrega: calcularDataPrevisaoEntrega(
      Number(i.previsao_entrega_dias) || prazoDiasPedido,
      dataPedido
    ),
    destino_esperado: i.destino_esperado || (i.venda_item_id ? 'cliente' : 'estoque'),
    observacoes: (i.observacoes || '').trim() || null,
  });

  const buildSavePayload = () => ({
    fornecedor_id: Number(fornecedorId),
    status,
    data_pedido: dataPedido || null,
    previsao_entrega_dias: prazoDiasPedido,
    previsao_entrega: dataPrevisaoPedido || null,
    frete_percentual: Number(fretePercentual),
    ipi_percentual: Number(ipiPercentual),
    observacoes,
    itens: itensManuais.map(mapItemPayload),
    itens_venda: itensVenda.map(mapItemPayload),
    itens_venda_removidos: removedVendaItemIds,
  });

  const handleSave = async ({ stayOnPage = false } = {}) => {
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveEncomendaFornecedor(
        buildSavePayload(),
        isNew ? null : Number(id)
      );
      hydrateFromEncomenda(saved);
      setBaselineSnapshot(snapshotFromEncomenda(saved));
      isDirtyRef.current = false;
      const feedbackMessage = isNew
        ? 'Encomenda criada com sucesso!'
        : `Encomenda ${saved.numero || numero || ''} atualizada com sucesso!`.trim();

      if (isNew && !stayOnPage) {
        showSuccess(feedbackMessage);
        skipLoadRef.current = true;
        navigate(`${listPath}/${saved.id}`, { replace: true });
      } else if (!stayOnPage) {
        navigate(listPath, {
          state: {
            feedback: {
              type: 'success',
              message: feedbackMessage,
            },
          },
        });
      } else {
        showSuccess(feedbackMessage);
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const gerarPdfInternal = async () => {
    setGeneratingPdf(true);
    setError('');
    try {
      await runWithFeedback(
        async () => {
          const result = await api.gerarPdfEncomendaFornecedor(Number(id));
          if (result.cancelled) return result;
          return result;
        },
        {
          loading: 'Gerando PDF do pedido ao fornecedor...',
          success: 'PDF gerado com sucesso.',
          error: 'Não foi possível gerar o PDF.',
        }
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleGerarPdf = () => {
    if (isNew) {
      setError('Salve a encomenda antes de gerar o PDF.');
      return;
    }
    if (isDirty) {
      setExitPrompt({ type: 'pdf' });
      return;
    }
    gerarPdfInternal();
  };

  const handleConfirmSave = async () => {
    const action = exitPrompt;
    const ok = await handleSave({ stayOnPage: true });
    if (!ok) return;
    setExitPrompt(null);
    if (action?.type === 'pdf') {
      await gerarPdfInternal();
    }
  };

  const handleConfirmDiscard = async () => {
    const action = exitPrompt;
    setExitPrompt(null);
    if (action?.type === 'pdf') {
      await gerarPdfInternal();
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Excluir encomenda',
      message: `Deseja excluir a encomenda ${numero}? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir encomenda',
      cancelLabel: 'Manter',
      variant: 'danger',
      loading: deleting,
    });
    if (!ok) return;

    setDeleting(true);
    setError('');
    try {
      await api.deleteEncomendaFornecedor(Number(id));
      navigate(listPath, {
        state: {
          feedback: {
            type: 'success',
            message: `Encomenda ${numero} excluída.`,
          },
        },
      });
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  if (loading) return <div className="loading">Carregando encomenda...</div>;

  return (
    <>
      <header className="page-header">
        <h2>{isNew ? 'Nova encomenda' : `Encomenda ${numero}`}</h2>
        <p>Cadastre produtos do fornecedor e vincule itens vendidos que aguardam encomenda</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="card">
        <div className="card-header">Dados da encomenda</div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="fornecedor">Fornecedor *</label>
              <select
                id="fornecedor"
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value)}
                disabled={!isNew && itensVenda.length > 0}
              >
                <option value="">Selecione...</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="data_pedido">Data do pedido</label>
              <input id="data_pedido" type="date" value={dataPedido} onChange={(e) => setDataPedido(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="prazo">Prazo de entrega (padrão)</label>
              <div className="inline-field">
                <select id="prazo" value={prazoOpcao} onChange={(e) => setPrazoOpcao(e.target.value)}>
                  {PRAZO_ENTREGA_OPCOES.map((d) => (
                    <option key={d} value={String(d)}>{d} dias</option>
                  ))}
                  <option value="custom">Personalizado</option>
                </select>
                {prazoOpcao === 'custom' && (
                  <input
                    type="number"
                    min="1"
                    placeholder="Dias"
                    value={prazoCustomDias}
                    onChange={(e) => setPrazoCustomDias(e.target.value)}
                    style={{ width: 90 }}
                  />
                )}
              </div>
            </div>
            <div className="form-group">
              <label>Data prevista da entrega</label>
              <div className="input-readonly" style={{ padding: '0.5rem 0.75rem' }}>
                {dataPrevisaoPedido ? formatDate(dataPrevisaoPedido) : '—'}
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="frete">Valor do frete (%)</label>
              <NumericInput
                id="frete"
                step="0.01"
                min="0"
                value={fretePercentual}
                onChange={setFretePercentual}
              />
            </div>
            <div className="form-group">
              <label htmlFor="ipi">IPI (%)</label>
              <NumericInput
                id="ipi"
                step="0.01"
                min="0"
                value={ipiPercentual}
                onChange={setIpiPercentual}
              />
            </div>
            <div className="form-group full-width">
              <label htmlFor="obs">Observações</label>
              <textarea id="obs" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Produtos da encomenda</div>
        <div className="card-body">
          <div className="toolbar" style={{ marginBottom: '1rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!fornecedorId) {
                  setError('Selecione o fornecedor antes de adicionar produtos.');
                  return;
                }
                setShowProdutoModal(true);
              }}
            >
              + Adicionar produto para estoque
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!fornecedorId) {
                  setError('Selecione o fornecedor antes de vincular itens de venda.');
                  return;
                }
                setShowVendaModal(true);
              }}
            >
              + Vincular itens de vendas
            </button>
            {itens.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={aplicarPrazoATodos}>
                Aplicar prazo padrão a todos
              </button>
            )}
          </div>

          {itens.length === 0 ? (
            <div className="empty-state">
              Nenhum produto adicionado. Use &quot;Adicionar produto para estoque&quot; para reposição
              ou &quot;Vincular itens de vendas&quot; para pedidos de clientes.
            </div>
          ) : (
            <div className="picker-table-wrap">
              <table className="picker-table">
                <thead>
                  <tr>
                    <th className="pendencia-pedido-col">Pedido / Estoque</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Custo negociado</th>
                    <th>Custo c/ frete e IPI</th>
                    <th>Prazo (dias)</th>
                    <th>Previsão</th>
                    <th>Observações</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item) => (
                    <tr key={item.key}>
                      <td className="pendencia-pedido-col">
                        <NumeroPedidoCell
                          numeroPedido={item.numero_pedido}
                          clienteNome={item.cliente_nome}
                          vendaNumero={item.venda_numero}
                          compact
                          semPedidoLabel="Estoque"
                        />
                      </td>
                      <td>
                        <strong>{item.produto_sku}</strong>
                        <br />
                        {item.produto_nome}
                      </td>
                      <td>
                        <NumericInput
                          min="1"
                          defaultOnEmpty={1}
                          max={item.quantidade_pendente_max || undefined}
                          value={item.quantidade_pedida}
                          onChange={(value) => updateItem(item.key, 'quantidade_pedida', value)}
                          style={{ width: 70 }}
                          disabled={!item.can_remove && Number(item.quantidade_recebida) > 0}
                        />
                      </td>
                      <td>
                        <NumericInput
                          step="0.01"
                          min="0"
                          value={item.custo_negociado}
                          onChange={(value) => updateItem(item.key, 'custo_negociado', value)}
                          style={{ width: 110 }}
                        />
                      </td>
                      <td>{formatCurrency(custoParaItem(item))}</td>
                      <td>
                        <select
                          value={PRAZO_ENTREGA_OPCOES.includes(Number(item.previsao_entrega_dias))
                            ? String(item.previsao_entrega_dias)
                            : 'custom'}
                          onChange={(e) => {
                            if (e.target.value === 'custom') {
                              updateItem(item.key, 'previsao_entrega_dias', 40);
                            } else {
                              updateItem(item.key, 'previsao_entrega_dias', Number(e.target.value));
                            }
                          }}
                          style={{ width: 100 }}
                        >
                          {PRAZO_ENTREGA_OPCOES.map((d) => (
                            <option key={d} value={d}>{d}d</option>
                          ))}
                          <option value="custom">Outro</option>
                        </select>
                      </td>
                      <td>{formatDate(dataPrevisaoItem(item))}</td>
                      <td>
                        <input
                          type="text"
                          value={item.observacoes || ''}
                          onChange={(e) => updateItem(item.key, 'observacoes', e.target.value)}
                          placeholder="Opcional"
                          style={{ width: 140 }}
                        />
                      </td>
                      <td>{item.status || 'pendente'}</td>
                      <td>
                        {item.can_remove !== false && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(item.key)}>
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="form-actions page-footer-actions">
        <button type="button" className="btn btn-secondary" onClick={() => navigate(listPath)}>Voltar</button>
        {!isNew && !temRecebimento && (
          <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Excluindo...' : 'Excluir encomenda'}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => handleSave()} disabled={saving || generatingPdf}>
          {saving ? 'Salvando...' : 'Salvar encomenda'}
        </button>
        {!isNew && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGerarPdf}
            disabled={generatingPdf || saving}
          >
            {generatingPdf ? 'Gerando PDF...' : 'Gerar PDF'}
          </button>
        )}
      </div>

      {exitPrompt && (
        <ConfirmarSaidaModal
          documentLabel="encomenda"
          variant={exitPrompt.type === 'pdf' ? 'pdf' : 'exit'}
          saving={saving || generatingPdf}
          onSalvar={handleConfirmSave}
          onDescartar={handleConfirmDiscard}
          onCancelar={() => setExitPrompt(null)}
        />
      )}

      {showProdutoModal && (
        <SelecionarProdutoModal
          fornecedorFixo={fornecedorId}
          closeOnSelect
          onClose={() => setShowProdutoModal(false)}
          onSelect={addProduto}
        />
      )}

      {showVendaModal && (
        <SelecionarItensVendaModal
          fornecedorId={fornecedorId}
          itensJaAdicionados={itensVenda}
          onClose={() => setShowVendaModal(false)}
          onConfirm={addItensVenda}
        />
      )}
    </>
  );
}
