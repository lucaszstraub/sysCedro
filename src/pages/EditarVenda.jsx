import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import {
  calcularAjustePagamentoSubtotal,
  criarLinhaPagamento,
  hojeIso,
  isFormaAReceber,
  isPagamentoLinhaAReceber,
  mapPagamentosFromApi,
} from '../constants/pagamento';
import { calcularTotalPagamentos, criarPagamento, formaPermiteParcelas } from '../constants/venda';
import { STATUS_ITEM_VENDA_LABEL, STATUS_ITEM_VENDA_OPTIONS, itemContaParaTotal } from '../constants/vendaItemStatus';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import NumericInput from '../components/NumericInput';
import SelecionarProdutoModal from '../components/SelecionarProdutoModal';

const listPath = '/ferramentas-venda/vendas';

function emptyConsignado() {
  return {
    key: `novo-${Date.now()}`,
    produto_id: null,
    descricao: '',
    quantidade: 1,
    preco_unitario: 0,
    produto_sku: null,
  };
}

function opcoesStatusItem(item) {
  const atual = item.status || 'efetivo';
  if (atual === 'cancelado') return [];
  if (atual === 'consignado') {
    return STATUS_ITEM_VENDA_OPTIONS.filter((opt) => opt.value !== 'consignado' || opt.value === atual);
  }
  return STATUS_ITEM_VENDA_OPTIONS;
}

function precoExibicaoItem(item) {
  const status = item.status || 'efetivo';
  if (status === 'consignado' || status === 'cancelado') {
    return Number(item.preco_unitario_lista) || Number(item.preco_unitario) || 0;
  }
  return Number(item.preco_unitario) || 0;
}

function subtotalItemProjetado(item, novoStatus) {
  const status = novoStatus || item.status || 'efetivo';
  if (!itemContaParaTotal(status)) return 0;
  const atual = item.status || 'efetivo';
  let preco = Number(item.preco_unitario) || 0;
  if (atual === 'consignado' && status === 'efetivo') {
    preco = Number(item.preco_unitario_lista) || preco;
  }
  return (Number(item.quantidade) || 0) * preco;
}

export default function EditarVenda() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { success: showSuccess, runWithFeedback } = useFeedback();

  const [venda, setVenda] = useState(null);
  const [alteracoes, setAlteracoes] = useState([]);
  const [statusPorItem, setStatusPorItem] = useState({});
  const [novosConsignados, setNovosConsignados] = useState([]);
  const [pagamentos, setPagamentos] = useState([criarPagamento()]);
  const [pagamentosIniciais, setPagamentosIniciais] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [observacoesIniciais, setObservacoesIniciais] = useState('');
  const [formasCadastro, setFormasCadastro] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState(location.state?.aba || 'itens');
  const [motivoModal, setMotivoModal] = useState(null);
  const [motivoTexto, setMotivoTexto] = useState('');
  const [recebimentoModal, setRecebimentoModal] = useState(null);
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hydratePagamentos = (detalhe, formas) => {
    const lista = mapPagamentosFromApi(detalhe.pagamentos || [], formas);
    setPagamentos(lista);
    setPagamentosIniciais(JSON.stringify(lista.map((p) => ({
      forma_pagamento_id: p.forma_pagamento_id,
      valor: Number(p.valor) || 0,
      parcelas: Number(p.parcelas) || 1,
      observacao: p.observacao || '',
      data_recebimento: p.data_recebimento || null,
    }))));
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [detalhe, historico, formas] = await Promise.all([
        api.getVenda(id),
        api.listAlteracoesVenda(id),
        api.listFormasPagamento(),
      ]);
      setVenda(detalhe);
      setAlteracoes(historico);
      setFormasCadastro(formas);
      hydratePagamentos(detalhe, formas);
      setObservacoes(detalhe.observacoes || '');
      setObservacoesIniciais(detalhe.observacoes || '');
      const mapa = {};
      (detalhe.ambientes || []).forEach((amb) => {
        (amb.itens || []).forEach((item) => {
          mapa[item.id] = item.status || 'efetivo';
        });
      });
      setStatusPorItem(mapa);
      setNovosConsignados([]);
    } catch (err) {
      setError(err.message);
      setVenda(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (location.state?.aba) {
      setAbaAtiva(location.state.aba);
    }
  }, [location.state?.aba]);

  const itensFlat = useMemo(() => (
    (venda?.ambientes || []).flatMap((amb) => (amb.itens || []).map((item) => ({
      ...item,
      ambiente_nome: amb.nome,
    })))
  ), [venda]);

  const alteracoesPendentes = useMemo(() => {
    const lista = [];
    itensFlat.forEach((item) => {
      const atual = item.status || 'efetivo';
      const novo = statusPorItem[item.id] || atual;
      if (novo !== atual) {
        lista.push({ venda_item_id: item.id, status: novo, descricao: item.descricao, anterior: atual });
      }
    });
    return lista;
  }, [itensFlat, statusPorItem]);

  const subtotalProjetado = useMemo(() => (
    itensFlat.reduce((sum, item) => {
      const novo = statusPorItem[item.id] || item.status || 'efetivo';
      return sum + subtotalItemProjetado(item, novo);
    }, 0)
  ), [itensFlat, statusPorItem]);

  const totalPago = useMemo(() => calcularTotalPagamentos(pagamentos), [pagamentos]);
  const { descontoExtra, acrescimoExtra, temAjustePreco } = useMemo(
    () => calcularAjustePagamentoSubtotal(subtotalProjetado, totalPago),
    [subtotalProjetado, totalPago]
  );

  const valorAReceberAtual = useMemo(() => {
    const nasLinhas = pagamentos
      .filter((p) => isPagamentoLinhaAReceber(p, formasCadastro))
      .reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
    if (nasLinhas > 0) return nasLinhas;
    return Number(venda?.valor_a_receber) || 0;
  }, [pagamentos, formasCadastro, venda]);

  const pagamentosAlterados = useMemo(() => {
    const atual = JSON.stringify(pagamentos.map((p) => ({
      forma_pagamento_id: p.forma_pagamento_id,
      valor: Number(p.valor) || 0,
      parcelas: Number(p.parcelas) || 1,
      observacao: p.observacao || '',
      data_recebimento: p.data_recebimento || null,
    })));
    return atual !== pagamentosIniciais;
  }, [pagamentos, pagamentosIniciais]);

  const observacoesAlteradas = observacoes !== observacoesIniciais;

  const temAlteracaoItens = alteracoesPendentes.length > 0
    || novosConsignados.some((item) => item.descricao?.trim() && Number(item.quantidade) > 0);

  const temAlteracoes = temAlteracaoItens || pagamentosAlterados || observacoesAlteradas;

  const handleStatusChange = (item, novoStatus) => {
    const atual = item.status || 'efetivo';
    if (novoStatus === atual) {
      setStatusPorItem((prev) => ({ ...prev, [item.id]: novoStatus }));
      return;
    }
    if (novoStatus === 'cancelado') {
      setMotivoModal({ item, novoStatus });
      setMotivoTexto('');
      return;
    }
    setStatusPorItem((prev) => ({ ...prev, [item.id]: novoStatus }));
  };

  const confirmarMotivo = () => {
    if (!motivoModal) return;
    if (!motivoTexto.trim()) {
      setError('Informe a justificativa do cancelamento.');
      return;
    }
    setStatusPorItem((prev) => ({
      ...prev,
      [motivoModal.item.id]: motivoModal.novoStatus,
      [`motivo_${motivoModal.item.id}`]: motivoTexto.trim(),
    }));
    setMotivoModal(null);
    setMotivoTexto('');
    setError('');
  };

  const adicionarProdutoConsignado = (produto) => {
    setNovosConsignados((prev) => [...prev, {
      key: `prod-${produto.id}-${Date.now()}`,
      produto_id: produto.id,
      descricao: produto.nome,
      quantidade: 1,
      preco_unitario: Number(produto.preco_venda) || 0,
      produto_sku: produto.sku,
    }]);
    setShowProdutoModal(false);
  };

  const updatePagamento = (index, field, value) => {
    setPagamentos((prev) => prev.map((pag, i) => (
      i === index ? { ...pag, [field]: value } : pag
    )));
  };

  const addPagamento = () => {
    setPagamentos((prev) => [...prev, criarLinhaPagamento(formasCadastro[0]?.id)]);
  };

  const removePagamento = (index) => {
    if (pagamentos.length <= 1) return;
    setPagamentos((prev) => prev.filter((_, i) => i !== index));
  };

  const mapPagamentosPayload = (lista) => lista.map((p) => ({
    forma_pagamento_id: p.forma_pagamento_id ? Number(p.forma_pagamento_id) : null,
    valor: Number(p.valor) || 0,
    parcelas: Number(p.parcelas) || 1,
    observacao: p.observacao || '',
    data_recebimento: p.data_recebimento || null,
  }));

  const salvarPagamentos = async (listaPagamentos, motivoPagamento) => {
    setSaving(true);
    setError('');
    try {
      await api.editarVenda(Number(id), {
        pagamentos: mapPagamentosPayload(listaPagamentos),
        motivo_pagamento: motivoPagamento,
      });
      showSuccess('Pagamento registrado com sucesso.');
      await runWithFeedback(
        () => api.gerarPdfAlteracaoVenda(Number(id)),
        {
          loading: 'Gerando comprovante de alteração...',
          success: 'Comprovante de alteração gerado.',
          error: 'Não foi possível gerar o comprovante.',
        }
      );
      await load();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const abrirEfetivarRecebimento = (indicePreferido = null) => {
    const idx = indicePreferido != null
      ? indicePreferido
      : pagamentos.findIndex((p) => isPagamentoLinhaAReceber(p, formasCadastro));
    if (idx < 0 || !isPagamentoLinhaAReceber(pagamentos[idx], formasCadastro)) {
      setError('Não há linha com forma de pagamento "A receber". Adicione a forma no cadastro ou inclua uma linha "A receber" nas formas de pagamento.');
      return;
    }
    const valor = Number(pagamentos[idx].valor) || 0;
    if (valor <= 0) {
      setError('O valor "A receber" está zerado.');
      return;
    }
    const outraForma = formasCadastro.find((f) => !isFormaAReceber(f.id, formasCadastro, f.nome));
    setRecebimentoModal({
      indiceAReceber: idx,
      valorPendente: valor,
      valorRecebido: valor,
      forma_pagamento_id: outraForma ? String(outraForma.id) : '',
      data_recebimento: hojeIso(),
    });
    setError('');
  };

  const confirmarEfetivarRecebimento = async () => {
    if (!recebimentoModal) return;
    const valorPendente = Number(
      recebimentoModal.valorPendente ?? recebimentoModal.valor
    ) || 0;
    const valorRecebido = Number(
      recebimentoModal.valorRecebido ?? recebimentoModal.valorPendente ?? recebimentoModal.valor
    ) || 0;
    if (valorRecebido <= 0 || !recebimentoModal.forma_pagamento_id) {
      setError('Informe a forma e o valor do pagamento recebido.');
      return;
    }
    const dataRecebimento = String(recebimentoModal.data_recebimento || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRecebimento)) {
      setError('Informe a data em que o pagamento foi recebido.');
      return;
    }
    if (valorRecebido > valorPendente + 0.01) {
      setError('O valor recebido não pode ser maior que o pendente "A receber".');
      return;
    }

    const idx = recebimentoModal.indiceAReceber;
    const valorAReceberLinha = Number(pagamentos[idx].valor) || 0;
    if (valorRecebido > valorAReceberLinha + 0.01) {
      setError('O valor recebido não pode ser maior que o pendente nesta linha.');
      return;
    }

    const novaLista = pagamentos.map((p) => ({ ...p }));
    const restante = round2(valorAReceberLinha - valorRecebido);
    novaLista[idx] = { ...novaLista[idx], valor: restante };
    if (restante <= 0.005) {
      novaLista.splice(idx, 1);
    }
    novaLista.push({
      ...criarLinhaPagamento(recebimentoModal.forma_pagamento_id),
      valor: valorRecebido,
      data_recebimento: dataRecebimento,
      observacao: `Recebido em ${formatDate(dataRecebimento)}`,
    });

    setRecebimentoModal(null);
    setAbaAtiva('pagamento');
    try {
      await salvarPagamentos(novaLista, 'Recebimento de valor pendente');
    } catch {
      // erro exibido em salvarPagamentos
    }
  };

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  const buildPayload = () => ({
    alteracoes_itens: alteracoesPendentes.map((alt) => ({
      venda_item_id: alt.venda_item_id,
      status: alt.status,
      motivo: statusPorItem[`motivo_${alt.venda_item_id}`] || null,
    })),
    novos_itens_consignados: novosConsignados
      .filter((item) => item.descricao?.trim() && Number(item.quantidade) > 0)
      .map((item) => ({
        produto_id: item.produto_id,
        descricao: item.descricao.trim(),
        quantidade: Number(item.quantidade) || 1,
        preco_unitario: Number(item.preco_unitario) || 0,
      })),
    pagamentos: pagamentosAlterados
      ? mapPagamentosPayload(pagamentos)
      : undefined,
    observacoes: observacoesAlteradas ? observacoes : undefined,
    motivo_pagamento: pagamentosAlterados ? 'Atualização das formas de pagamento' : undefined,
  });

  const handleSalvar = async () => {
    if (!temAlteracoes) {
      setError('Nenhuma alteração para salvar.');
      return;
    }

    if (pagamentosAlterados && totalPago <= 0 && subtotalProjetado > 0) {
      setError('Informe pelo menos um pagamento com valor maior que zero.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.editarVenda(Number(id), buildPayload());
      showSuccess('Venda atualizada. Comissões recalculadas.');
      await runWithFeedback(
        () => api.gerarPdfAlteracaoVenda(Number(id)),
        {
          loading: 'Gerando comprovante de alteração...',
          success: 'Comprovante de alteração gerado.',
          error: 'Não foi possível gerar o comprovante.',
        }
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Carregando venda...</div>;
  if (!venda) return <PageAlert>{error || 'Venda não encontrada.'}</PageAlert>;

  return (
    <>
      <header className="page-header">
        <h2>Editar venda — {venda.numero}</h2>
        <p>
          Pedido <strong>{venda.numero_pedido}</strong>
          {' · '}{venda.cliente_nome}
          {' · '}Total atual: <strong>{formatCurrency(venda.total)}</strong>
          {subtotalProjetado !== Number(venda.subtotal_bruto || venda.subtotal) && (
            <>
              {' · '}Novo subtotal: <strong>{formatCurrency(subtotalProjetado)}</strong>
            </>
          )}
        </p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {venda.desativada && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <strong>Venda desativada</strong>
          <p style={{ margin: '0.35rem 0 0' }}>
            Esta venda foi excluída e não pode ser editada. Restaure-a na lista de vendas desativadas.
          </p>
        </div>
      )}

      {venda.tem_alteracao_pos_venda && venda.nota_alteracao && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <strong>Pedido com alteração registrada</strong>
          <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>{venda.nota_alteracao}</p>
        </div>
      )}

      {venda.tem_pendencia && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <strong>Pendências neste pedido</strong>
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.25rem' }}>
            {venda.tem_a_receber && (
              <li>
                Pagamento <strong>a receber</strong>: {formatCurrency(venda.valor_a_receber)}
                {' '}(use a aba Pagamento para registrar o recebimento)
              </li>
            )}
            {venda.tem_consignado_nao_cobrado && (
              <li>
                <strong>{venda.qtd_consignado_nao_cobrado}</strong> produto(s) consignado(s) já
                entregue(s) ao cliente e ainda não cobrados
                {venda.valor_consignado_nao_cobrado > 0 && (
                  <> (estimativa: {formatCurrency(venda.valor_consignado_nao_cobrado)})</>
                )}
                {' '}— efetive o item na tabela abaixo quando o cliente confirmar a compra.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={`btn btn-sm ${abaAtiva === 'itens' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setAbaAtiva('itens')}
        >
          Itens
          {temAlteracaoItens && ' •'}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${abaAtiva === 'pagamento' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setAbaAtiva('pagamento')}
        >
          Pagamento e pedido
          {(pagamentosAlterados || observacoesAlteradas) && ' •'}
        </button>
      </div>

      {abaAtiva === 'itens' && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-body">
              <p className="hint-text">
                Altere o status dos itens: <strong>Efetivo</strong>, <strong>Consignado</strong> ou{' '}
                <strong>Cancelado</strong>. Itens consignados podem ser efetivados quando o cliente
                confirma a compra. Itens cancelados exigem justificativa.
              </p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Ambiente</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Preço</th>
                    <th>Subtotal</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {itensFlat.map((item) => {
                    const novoStatus = statusPorItem[item.id] || item.status || 'efetivo';
                    return (
                      <tr key={item.id}>
                        <td>{item.ambiente_nome}</td>
                        <td>
                          {item.produto_sku && <strong>{item.produto_sku}</strong>}
                          {item.produto_sku && <br />}
                          {item.descricao}
                        </td>
                        <td>{item.quantidade}</td>
                        <td>{formatCurrency(precoExibicaoItem({ ...item, status: novoStatus }))}</td>
                        <td>
                          {itemContaParaTotal(novoStatus)
                            ? formatCurrency(subtotalItemProjetado(item, novoStatus))
                            : '—'}
                        </td>
                        <td>
                          {(item.status || 'efetivo') === 'cancelado' ? (
                            <span className="badge badge-estornado">{STATUS_ITEM_VENDA_LABEL.cancelado}</span>
                          ) : (
                            <select
                              value={novoStatus}
                              onChange={(e) => handleStatusChange(item, e.target.value)}
                            >
                              {opcoesStatusItem(item).map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Incluir itens consignados</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowProdutoModal(true)}>
                  + Do catálogo
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNovosConsignados((p) => [...p, emptyConsignado()])}>
                  + Item avulso
                </button>
              </div>
            </div>
            <div className="card-body">
              {novosConsignados.length === 0 ? (
                <p className="hint-text">Nenhum item consignado novo.</p>
              ) : (
                novosConsignados.map((item, index) => (
                  <div key={item.key} className="form-grid" style={{ marginBottom: '0.75rem' }}>
                    <div className="form-group" style={{ gridColumn: 'span 2' }}>
                      <label>Descrição</label>
                      <input
                        value={item.descricao}
                        onChange={(e) => setNovosConsignados((prev) => prev.map((row, i) => (
                          i === index ? { ...row, descricao: e.target.value } : row
                        )))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Qtd</label>
                      <NumericInput
                        min="1"
                        defaultOnEmpty={1}
                        value={item.quantidade}
                        onChange={(v) => setNovosConsignados((prev) => prev.map((row, i) => (
                          i === index ? { ...row, quantidade: v } : row
                        )))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Preço ref.</label>
                      <NumericInput
                        min="0"
                        step="0.01"
                        defaultOnEmpty={0}
                        value={item.preco_unitario}
                        onChange={(v) => setNovosConsignados((prev) => prev.map((row, i) => (
                          i === index ? { ...row, preco_unitario: v } : row
                        )))}
                      />
                    </div>
                    <div className="form-group" style={{ alignSelf: 'end' }}>
                      <button
                        type="button"
                        className="btn btn-link text-danger"
                        onClick={() => setNovosConsignados((prev) => prev.filter((_, i) => i !== index))}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {abaAtiva === 'pagamento' && (
        <>
          {(valorAReceberAtual > 0 || venda.tem_a_receber) && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <span className="badge badge-a-receber">A receber</span>
                  {' '}
                  <strong>{formatCurrency(valorAReceberAtual)}</strong>
                  <div className="hint-text">Pendente neste pedido — registre abaixo quando o cliente pagar</div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={abrirEfetivarRecebimento}
                  disabled={saving}
                >
                  Registrar pagamento recebido
                </button>
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">Formas de pagamento</div>
            <div className="card-body">
              <p className="hint-text">
                Registre pagamentos pendentes com o botão <strong>Receber</strong> e informe a data
                em que o cliente pagou. Pagamentos já recebidos exibem a data de recebimento.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Forma</th>
                    <th>Valor (R$)</th>
                    <th>Situação</th>
                    <th>Data receb.</th>
                    <th>Parcelas</th>
                    <th>Observação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagamentos.map((pag, index) => {
                    const pendente = isPagamentoLinhaAReceber(pag, formasCadastro);
                    return (
                    <tr key={pag.id} className={pendente ? 'visao-row-a-receber' : ''}>
                      <td>
                        <select
                          value={pag.forma_pagamento_id || ''}
                          onChange={(e) => updatePagamento(index, 'forma_pagamento_id', e.target.value)}
                          disabled={pendente}
                        >
                          <option value="">Selecione...</option>
                          {formasCadastro.map((forma) => (
                            <option key={forma.id} value={forma.id}>{forma.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <NumericInput
                          step="0.01"
                          min="0"
                          value={pag.valor}
                          onChange={(value) => updatePagamento(index, 'valor', value)}
                          style={{ width: 130 }}
                          disabled={pendente}
                        />
                      </td>
                      <td>
                        {pendente ? (
                          <span className="badge badge-a-receber">Pendente</span>
                        ) : (
                          <span className="badge badge-recebido">Recebido</span>
                        )}
                      </td>
                      <td>
                        {pendente ? (
                          '—'
                        ) : (
                          <input
                            type="date"
                            value={pag.data_recebimento || ''}
                            onChange={(e) => updatePagamento(index, 'data_recebimento', e.target.value || null)}
                            style={{ width: 140 }}
                          />
                        )}
                      </td>
                      <td>
                        <NumericInput
                          min="1"
                          defaultOnEmpty={1}
                          value={pag.parcelas}
                          onChange={(value) => updatePagamento(index, 'parcelas', value)}
                          style={{ width: 70 }}
                          disabled={!formaPermiteParcelas(pag.forma_pagamento_id, formasCadastro) || pendente}
                        />
                      </td>
                      <td>
                        <input
                          value={pag.observacao}
                          onChange={(e) => updatePagamento(index, 'observacao', e.target.value)}
                          placeholder="Opcional"
                          style={{ width: '100%' }}
                          disabled={pendente}
                        />
                      </td>
                      <td className="table-actions">
                        {pendente ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => abrirEfetivarRecebimento(index)}
                            disabled={saving}
                          >
                            Receber
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removePagamento(index)}
                            disabled={pagamentos.length <= 1}
                          >
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="toolbar" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={addPagamento}>
                  + Adicionar pagamento
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">Observações do pedido</div>
            <div className="card-body">
              <textarea
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Observações gerais sobre o pedido..."
              />
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-body">
              <div className="totals-box">
                <div className="total-line">
                  <span>Subtotal dos itens efetivos:</span>
                  <strong>{formatCurrency(subtotalProjetado)}</strong>
                </div>
                <div className="total-line">
                  <span>Valor acordado (pagamentos):</span>
                  <strong>{formatCurrency(totalPago)}</strong>
                </div>
                {descontoExtra > 0.005 && (
                  <div className="total-line">
                    <span>Desconto:</span>
                    <strong>{formatCurrency(descontoExtra)}</strong>
                  </div>
                )}
                {acrescimoExtra > 0.005 && (
                  <div className="total-line">
                    <span>Ajuste nos preços:</span>
                    <strong>{formatCurrency(acrescimoExtra)}</strong>
                  </div>
                )}
                {temAjustePreco && (
                  <p className="hint-text" style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                    Ao salvar, os preços unitários serão redistribuídos conforme o valor dos pagamentos.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {alteracoes.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-header"><h3 style={{ margin: 0 }}>Histórico de alterações</h3></div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {alteracoes.map((alt) => (
                <li key={alt.id} style={{ marginBottom: '0.5rem' }}>
                  <strong>{formatDateTime(alt.criado_em)}</strong> — {alt.descricao}
                  <div className="hint-text">Motivo: {alt.motivo}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="toolbar">
        <button type="button" className="btn btn-secondary" onClick={() => navigate(listPath)}>
          Voltar
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSalvar} disabled={saving || venda.desativada || !temAlteracoes}>
          {saving ? 'Salvando...' : 'Salvar alterações e gerar comprovante'}
        </button>
      </div>

      {motivoModal && (
        <div className="modal-overlay" onClick={() => setMotivoModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Justificativa obrigatória</h3>
              <button type="button" className="modal-close" onClick={() => setMotivoModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Informe o motivo para cancelar o item <strong>{motivoModal.item.descricao}</strong>.</p>
              <textarea
                rows={4}
                value={motivoTexto}
                onChange={(e) => setMotivoTexto(e.target.value)}
                placeholder="Descreva o motivo da alteração..."
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setMotivoModal(null)}>Voltar</button>
              <button type="button" className="btn btn-primary" onClick={confirmarMotivo}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {recebimentoModal && (
        <div className="modal-overlay" onClick={() => setRecebimentoModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Registrar pagamento recebido</h3>
              <button type="button" className="modal-close" onClick={() => setRecebimentoModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>
                Valor pendente em &quot;A receber&quot;:{' '}
                <strong>
                  {formatCurrency(
                    recebimentoModal.valorPendente ?? recebimentoModal.valor ?? 0
                  )}
                </strong>
              </p>
              <div className="form-group">
                <label>Forma de pagamento recebida</label>
                <select
                  value={recebimentoModal.forma_pagamento_id}
                  onChange={(e) => setRecebimentoModal((prev) => ({
                    ...prev,
                    forma_pagamento_id: e.target.value,
                  }))}
                >
                  <option value="">Selecione...</option>
                  {formasCadastro
                    .filter((f) => !isFormaAReceber(f.id, formasCadastro))
                    .map((forma) => (
                      <option key={forma.id} value={forma.id}>{forma.nome}</option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Data do recebimento *</label>
                <input
                  type="date"
                  value={recebimentoModal.data_recebimento || hojeIso()}
                  onChange={(e) => setRecebimentoModal((prev) => ({
                    ...prev,
                    data_recebimento: e.target.value,
                  }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Valor recebido (R$)</label>
                <NumericInput
                  min="0"
                  step="0.01"
                  max={recebimentoModal.valorPendente ?? recebimentoModal.valor ?? 0}
                  value={recebimentoModal.valorRecebido ?? recebimentoModal.valorPendente ?? recebimentoModal.valor ?? 0}
                  onChange={(v) => setRecebimentoModal((prev) => ({ ...prev, valorRecebido: v }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setRecebimentoModal(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={confirmarEfetivarRecebimento} disabled={saving}>
                {saving ? 'Salvando...' : 'Confirmar e salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProdutoModal && (
        <SelecionarProdutoModal
          onClose={() => setShowProdutoModal(false)}
          onSelect={adicionarProdutoConsignado}
          closeOnSelect
        />
      )}
    </>
  );
}
