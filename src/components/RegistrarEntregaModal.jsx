import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import NumericInput from './NumericInput';
import SelecionarProdutoModal from './SelecionarProdutoModal';
import { PERIODO_ENTREGA_OPTIONS, MODE_ENTREGA_LABEL, labelPeriodoEntrega } from '../constants/entregas';
import { abrirWhatsAppAgendamento } from '../utils/entregaAgendamento';
import { formatDate, toInputDate } from '../utils/format';

function hojeIso() {
  return toInputDate(new Date());
}

function volumesPorUnidade(valor) {
  return Math.max(1, Number(valor) || 1);
}

function calcularVolumesTotais(itens, quantidades, consignados) {
  let total = 0;

  for (const item of itens) {
    const qtd = Number(quantidades[item.id]) || 0;
    if (qtd <= 0) continue;
    total += qtd * volumesPorUnidade(item.volumes_por_unidade);
  }

  for (const item of consignados) {
    const qtd = Number(item.quantidade) || 0;
    if (qtd <= 0) continue;
    total += qtd * volumesPorUnidade(item.volumes_por_unidade);
  }

  return total;
}

function mapConsignadosIniciais(itens = []) {
  return itens.map((item) => ({
    key: `consignado-${item.id}`,
    id: item.id,
    venda_item_id: item.venda_item_id || null,
    produto_id: item.produto_id || null,
    descricao: item.descricao || '',
    quantidade: item.quantidade || 1,
    volumes_por_unidade: volumesPorUnidade(item.volumes_por_unidade),
    produto_sku: item.produto_sku || null,
  }));
}

function saldoItemPedido(item) {
  const pedido = Number(item.quantidade_venda ?? item.quantidade) || 0;
  const entregue = Number(item.quantidade_entregue_venda ?? item.quantidade_entregue) || 0;
  return Math.max(0, pedido - entregue);
}

export default function RegistrarEntregaModal({
  entrega,
  mode = 'agendar',
  onClose,
  onConfirm,
  onAgendar,
  onPrepare,
  onPrint,
  onConfirmarCliente,
}) {
  const [observacoes, setObservacoes] = useState(entrega.observacoes || '');
  const [observacoesKanban, setObservacoesKanban] = useState(entrega.observacoes_kanban || '');
  const [dataPrevista, setDataPrevista] = useState(
    () => toInputDate(entrega.data_prevista) || hojeIso()
  );
  const [periodoEntrega, setPeriodoEntrega] = useState(entrega.periodo_entrega || 'matutino');
  const [flagUrgencia, setFlagUrgencia] = useState(Boolean(entrega.flag_urgencia));
  const [quantidades, setQuantidades] = useState({});
  const [consignados, setConsignados] = useState(() => mapConsignadosIniciais(entrega.itens_consignados));
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const initial = {};
    (entrega.itens || []).forEach((item) => {
      const isConsignado = item.item_status === 'consignado';
      const limite = isConsignado
        ? item.pendente_entrega
        : Math.min(item.disponivel_agora, item.pendente_entrega);
      const sugerido = entrega.tipo_liberacao === 'completa'
        ? item.pendente_entrega
        : limite;
      initial[item.id] = sugerido > 0 ? sugerido : 0;
    });
    setQuantidades(initial);
    setConsignados(mapConsignadosIniciais(entrega.itens_consignados));
    setObservacoes(entrega.observacoes || '');
    setObservacoesKanban(entrega.observacoes_kanban || '');
    setDataPrevista(toInputDate(entrega.data_prevista) || hojeIso());
    setPeriodoEntrega(entrega.periodo_entrega || 'matutino');
    setFlagUrgencia(Boolean(entrega.flag_urgencia));
  }, [entrega]);

  const quantidadeItens = useMemo(() => (
    Object.values(quantidades).reduce((sum, qtd) => sum + (Number(qtd) || 0), 0)
    + consignados.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0)
  ), [quantidades, consignados]);

  const quantidadeVolumes = useMemo(
    () => calcularVolumesTotais(entrega.itens || [], quantidades, consignados),
    [entrega.itens, quantidades, consignados]
  );

  const setQtd = (itemId, value) => {
    setQuantidades((prev) => ({ ...prev, [itemId]: value }));
  };

  const buildPayload = () => ({
    observacoes,
    observacoes_kanban: observacoesKanban.trim() || null,
    data_prevista: dataPrevista,
    periodo_entrega: periodoEntrega,
    flag_urgencia: flagUrgencia,
    itens: Object.entries(quantidades)
      .map(([entrega_item_id, quantidade]) => ({
        entrega_item_id: Number(entrega_item_id),
        quantidade: Number(quantidade) || 0,
      }))
      .filter((item) => item.quantidade > 0),
    itens_consignados: consignados
      .filter((item) => item.descricao?.trim() && Number(item.quantidade) > 0)
      .map((item) => ({
        id: item.id,
        venda_item_id: item.venda_item_id || null,
        produto_id: item.produto_id || null,
        descricao: item.descricao.trim(),
        quantidade: Number(item.quantidade) || 0,
        volumes_por_unidade: volumesPorUnidade(item.volumes_por_unidade),
        observacoes: item.observacoes?.trim() || null,
      })),
  });

  const adicionarConsignadoAvulso = () => {
    setConsignados((prev) => [
      ...prev,
      {
        key: `novo-${Date.now()}`,
        produto_id: null,
        descricao: '',
        quantidade: 1,
        volumes_por_unidade: 1,
      },
    ]);
  };

  const adicionarProdutoConsignado = (produto) => {
    setConsignados((prev) => [
      ...prev,
      {
        key: `produto-${produto.id}-${Date.now()}`,
        produto_id: produto.id,
        descricao: produto.nome,
        quantidade: 1,
        volumes_por_unidade: volumesPorUnidade(produto.volumes_por_unidade),
        produto_sku: produto.sku,
      },
    ]);
    setShowProdutoModal(false);
  };

  const atualizarConsignado = (key, field, value) => {
    setConsignados((prev) => prev.map((item) => (
      item.key === key ? { ...item, [field]: value } : item
    )));
  };

  const removerConsignado = (key) => {
    setConsignados((prev) => prev.filter((item) => item.key !== key));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onConfirm(buildPayload());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleAgendar = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (mode === 'editar' && onConfirm) {
        await onConfirm(buildPayload());
      } else if (onAgendar) {
        await onAgendar(buildPayload());
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    setError('');
    try {
      if (onPrepare) await onPrepare(buildPayload());
      await onPrint();
    } catch (err) {
      setError(err.message);
    } finally {
      setPrinting(false);
    }
  };

  const handleWhatsApp = async () => {
    setError('');
    try {
      await abrirWhatsAppAgendamento(
        entrega.cliente_telefone,
        entrega.cliente_nome,
        dataPrevista,
        periodoEntrega
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmarCliente = async () => {
    if (!onConfirmarCliente) return;
    setSaving(true);
    setError('');
    try {
      await onConfirmarCliente();
      setSaving(false);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const aguardandoConfirmacao = entrega.confirmacao_cliente === 'pendente';
  const podeWhatsApp = mode !== 'concluir' && Boolean(entrega.cliente_telefone);
  const labels = MODE_ENTREGA_LABEL[mode] || MODE_ENTREGA_LABEL.agendar;
  const tituloModal = `${labels.titulo} — ${entrega.numero_pedido || entrega.venda_numero}`;
  const isConcluir = mode === 'concluir';

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h3>{tituloModal}</h3>
              {isConcluir && (
                <p className="picker-subtitle">Confirme as quantidades entregues. O estoque será baixado automaticamente.</p>
              )}
            </div>
            <button type="button" className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <form onSubmit={isConcluir ? handleSubmit : handleAgendar}>
            <div className="modal-body">
              {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

              {isConcluir ? (
                <div className="entrega-modal-resumo card-inset">
                  <p><strong>Cliente:</strong> {entrega.cliente_nome}</p>
                  <p>
                    <strong>Agendamento:</strong>{' '}
                    {formatDate(dataPrevista)} · {labelPeriodoEntrega(periodoEntrega)}
                  </p>
                  <p className="hint-text" style={{ margin: 0 }}>
                    Informe abaixo o que está sendo entregue nesta expedição.
                  </p>
                </div>
              ) : (
                <p className="hint-text" style={{ marginBottom: '0.75rem' }}>
                  Cliente: <strong>{entrega.cliente_nome}</strong>
                  {' · '}Venda {entrega.venda_numero}
                  {' · '}
                  {entrega.tipo_liberacao === 'completa'
                    ? 'Liberação completa'
                    : 'Liberação parcial'}
                </p>
              )}

              {entrega.venda_observacoes && !isConcluir && (
                <div className="alert alert-info" style={{ marginBottom: '0.75rem' }}>
                  <strong>Observações do pedido</strong>
                  <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>{entrega.venda_observacoes}</p>
                </div>
              )}

              {!isConcluir && (
              <div className="form-grid" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="data-prevista-entrega">{labels.dataLabel}</label>
                  <input
                    id="data-prevista-entrega"
                    type="date"
                    value={dataPrevista}
                    onChange={(e) => setDataPrevista(e.target.value)}
                    required
                    disabled={mode === 'concluir'}
                  />
                  <span className="hint-text">Data prevista para a expedição.</span>
                </div>
                <div className="form-group">
                  <label htmlFor="periodo-entrega">Período da entrega</label>
                  <select
                    id="periodo-entrega"
                    value={periodoEntrega}
                    onChange={(e) => setPeriodoEntrega(e.target.value)}
                    required
                    disabled={mode === 'concluir'}
                  >
                    {PERIODO_ENTREGA_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <span className="hint-text">Turno previsto para a entrega.</span>
                </div>
                <div className="form-group">
                  <label>Quantidade de itens</label>
                  <input value={quantidadeItens} readOnly disabled />
                </div>
                <div className="form-group">
                  <label>Número de volumes</label>
                  <input value={quantidadeVolumes} readOnly disabled />
                </div>
                <div className="form-group">
                  <label className="checkbox-label" style={{ marginTop: '1.6rem' }}>
                    <input
                      type="checkbox"
                      checked={flagUrgencia}
                      onChange={(e) => setFlagUrgencia(e.target.checked)}
                      disabled={mode === 'concluir'}
                    />
                    Urgência
                  </label>
                </div>
                <div className="form-group full-width">
                  <label>Observações da expedição</label>
                  <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
                </div>
                {mode === 'editar' && (
                  <div className="form-group full-width">
                    <label>Observações do card (kanban)</label>
                    <textarea
                      rows={2}
                      value={observacoesKanban}
                      onChange={(e) => setObservacoesKanban(e.target.value)}
                    />
                  </div>
                )}
              </div>
              )}

              {isConcluir && (
                <div className="form-group full-width" style={{ marginBottom: '1rem' }}>
                  <label>Observações da entrega</label>
                  <textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
                </div>
              )}

              {mode !== 'concluir' && (
                <div className="entrega-agendamento-acoes" style={{ marginBottom: '1rem' }}>
                  {aguardandoConfirmacao && mode === 'editar' && (
                    <p className="hint-text entrega-agendamento-hint">
                      Pré-agendamento aguardando confirmação do cliente. Envie a mensagem no WhatsApp
                      e, após a resposta, confirme ou altere a data/turno abaixo.
                    </p>
                  )}
                  <div className="entrega-agendamento-botoes">
                    {podeWhatsApp && (
                      <button
                        type="button"
                        className="btn btn-whatsapp btn-sm"
                        onClick={handleWhatsApp}
                        disabled={saving}
                      >
                        WhatsApp — confirmar data
                      </button>
                    )}
                    {mode === 'editar' && aguardandoConfirmacao && onConfirmarCliente && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleConfirmarCliente}
                        disabled={saving}
                      >
                        Cliente confirmou agendamento
                      </button>
                    )}
                  </div>
                  {!entrega.cliente_telefone && (
                    <p className="hint-text text-warning" style={{ marginTop: '0.5rem' }}>
                      Cadastre o telefone do cliente para enviar mensagem pelo WhatsApp.
                    </p>
                  )}
                </div>
              )}

              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    {!isConcluir && <th>Pedido</th>}
                    {!isConcluir && <th>Entregue</th>}
                    <th title="Unidades liberadas em estoque ou encomenda recebida">Disponível</th>
                    {!isConcluir && <th title="Quantidade do pedido menos o já entregue">Saldo</th>}
                    <th>{isConcluir ? 'Qtd. a entregar' : 'Entregar agora'}</th>
                    {!isConcluir && <th>Volumes</th>}
                  </tr>
                </thead>
                <tbody>
                  {(entrega.itens || []).map((item) => {
                    const qtdEntregar = Number(quantidades[item.id]) || 0;
                    const volumesLinha = qtdEntregar * volumesPorUnidade(item.volumes_por_unidade);
                    const isConsignado = item.item_status === 'consignado';
                    const maxEntregar = isConsignado
                      ? item.pendente_entrega
                      : Math.min(item.disponivel_agora, item.pendente_entrega);
                    const podeEntregar = maxEntregar > 0;
                    return (
                      <tr key={item.id} className={isConsignado ? 'row-item-consignado' : ''}>
                        <td>
                          {item.produto_sku && <strong>{item.produto_sku}</strong>}
                          {item.produto_sku && <br />}
                          {item.descricao}
                          {isConsignado && (
                            <>
                              <br />
                              <span className="badge badge-consignado-pendente">Consignado</span>
                            </>
                          )}
                        </td>
                        {!isConcluir && <td>{item.quantidade}</td>}
                        {!isConcluir && <td>{item.quantidade_entregue}</td>}
                        <td>
                          <span className={item.disponivel_agora > 0 ? 'text-success' : ''}>
                            {isConsignado ? item.pendente_entrega : item.disponivel_agora}
                          </span>
                        </td>
                        {!isConcluir && <td>{saldoItemPedido(item)}</td>}
                        <td>
                          <NumericInput
                            min="0"
                            max={maxEntregar}
                            defaultOnEmpty={0}
                            value={quantidades[item.id] ?? 0}
                            onChange={(v) => setQtd(item.id, v)}
                            style={{ width: 70 }}
                            disabled={!podeEntregar}
                          />
                        </td>
                        {!isConcluir && <td>{volumesLinha}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!isConcluir && (
              <div className="entrega-consignados-section" style={{ marginTop: '1.25rem' }}>
                <div className="entrega-consignados-header">
                  <h4>Produtos consignados nesta expedição</h4>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowProdutoModal(true)}
                    >
                      + Do catálogo
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={adicionarConsignadoAvulso}
                    >
                      + Item avulso
                    </button>
                  </div>
                </div>

                {consignados.length === 0 ? (
                  <p className="hint-text">
                    Inclua produtos enviados em consignação junto com esta entrega, se houver.
                  </p>
                ) : (
                  <div className="colaborador-beneficios-lista">
                    {consignados.map((item) => (
                      <div key={item.key} className="colaborador-beneficio-row">
                        <div className="form-group" style={{ flex: 2 }}>
                          <label>Descrição</label>
                          <input
                            value={item.descricao}
                            onChange={(e) => atualizarConsignado(item.key, 'descricao', e.target.value)}
                            placeholder="Nome do produto consignado"
                            required
                          />
                          {item.produto_sku && (
                            <span className="hint-text">SKU: {item.produto_sku}</span>
                          )}
                        </div>
                        <div className="form-group">
                          <label>Qtd</label>
                          <NumericInput
                            min="1"
                            defaultOnEmpty={1}
                            value={item.quantidade}
                            onChange={(v) => atualizarConsignado(item.key, 'quantidade', v)}
                            style={{ width: 70 }}
                          />
                        </div>
                        <div className="form-group">
                          <label>Vol./un.</label>
                          <NumericInput
                            min="1"
                            defaultOnEmpty={1}
                            value={item.volumes_por_unidade}
                            onChange={(v) => atualizarConsignado(item.key, 'volumes_por_unidade', v)}
                            style={{ width: 70 }}
                          />
                        </div>
                        <div className="form-group">
                          <label>Volumes</label>
                          <input
                            value={(Number(item.quantidade) || 0) * volumesPorUnidade(item.volumes_por_unidade)}
                            readOnly
                            disabled
                            style={{ width: 70 }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-link btn-sm text-danger"
                          onClick={() => removerConsignado(item.key)}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
            <div className="modal-footer">
              {onPrint && (
                <button type="button" className="btn btn-secondary" onClick={handlePrint} disabled={printing || saving}>
                  {printing ? 'Gerando PDF...' : 'Imprimir ticket'}
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : labels.submit}
              </button>
            </div>
          </form>
        </div>
      </div>

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
