import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import {
  AMBIENTE_NOME_PADRAO,
  FORMAS_PAGAMENTO_PADRAO,
  PRAZO_ENTREGA_OPTIONS,
  PRAZO_ENTREGA_PADRAO,
  STATUS_LABEL,
  VALIDADE_DIAS_OPTIONS,
  calcularTotalComDesconto,
  criarFormaPagamento,
  criarItemPlanejado,
  aplicarTemplatePlanejado,
} from '../constants/orcamentoPlanejado';
import { formatCurrency } from '../utils/format';
import { buildOrcamentoPlanejadoSnapshot, snapshotFromPlanejado, mapAmbientesFromPlanejado } from '../utils/orcamentoPlanejadoSnapshot';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import ClienteModal from '../components/ClienteModal';
import ClienteDadosResumo from '../components/ClienteDadosResumo';
import ConfirmarSaidaModal from '../components/ConfirmarSaidaModal';
import NumericInput from '../components/NumericInput';
import OrcamentoPlanejadoItemForm from '../components/OrcamentoPlanejadoItemForm';
import SelecionarClienteModal from '../components/SelecionarClienteModal';
import { VENDEDOR_CLASSIFICACAO_PLANEJADOS } from '../constants/vendedor';
import { loadVendedoresPorClassificacao } from '../utils/loadVendedores';
import { useAuth } from '../context/AuthContext';
import { isVendedorRestrito, getVendedorIdUsuario } from '../utils/vendedorRestrito';

function emptyAmbiente() {
  return { nome: '', itens: [] };
}

export default function OrcamentoPlanejadoForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState('');
  const { success: showSuccess, runWithFeedback } = useFeedback();
  const { user } = useAuth();
  const vendedorBloqueado = isVendedorRestrito(user);
  const meuVendedorId = getVendedorIdUsuario(user);

  const [numero, setNumero] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [status, setStatus] = useState('rascunho');
  const [validadeDias, setValidadeDias] = useState(30);
  const [prazoEntrega, setPrazoEntrega] = useState(String(PRAZO_ENTREGA_PADRAO));
  const [prazoEntregaOutro, setPrazoEntregaOutro] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [formasPagamento, setFormasPagamento] = useState(FORMAS_PAGAMENTO_PADRAO);
  const [ambientes, setAmbientes] = useState([emptyAmbiente()]);
  const [produtosPlanejados, setProdutosPlanejados] = useState([]);

  const [showClienteModal, setShowClienteModal] = useState(false);
  const [clienteModalCliente, setClienteModalCliente] = useState(null);
  const [showSelecionarCliente, setShowSelecionarCliente] = useState(false);
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [exitPrompt, setExitPrompt] = useState(null);
  const isDirtyRef = useRef(false);
  const skipLoadRef = useRef(false);

  const subtotal = useMemo(
    () => ambientes.reduce((sum, ambiente) => sum + ambiente.itens.reduce(
      (acc, item) => acc + (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0), 0
    ), 0),
    [ambientes]
  );

  const getFormState = () => ({
    clienteId,
    vendedorId,
    status,
    validadeDias,
    prazoEntrega,
    prazoEntregaOutro,
    observacoes,
    formasPagamento,
    ambientes,
  });

  const currentSnapshot = useMemo(
    () => buildOrcamentoPlanejadoSnapshot(getFormState()),
    [clienteId, vendedorId, status, validadeDias, prazoEntrega, prazoEntregaOutro, observacoes, formasPagamento, ambientes]
  );

  const isDirty = baselineSnapshot !== null && currentSnapshot !== baselineSnapshot;

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    if (!clienteId) {
      setClienteSelecionado(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const cliente = await api.getCliente(Number(clienteId));
        if (!cancelled) setClienteSelecionado(cliente);
      } catch {
        /* mantém seleção parcial se a consulta falhar */
      }
    })();
    return () => { cancelled = true; };
  }, [clienteId]);

  useEffect(() => {
    api.onAppCloseRequest(() => {
      if (isDirtyRef.current) {
        setExitPrompt({ type: 'close' });
      } else {
        api.confirmAppClose();
      }
    });
    return () => {
      api.onAppCloseRequest(() => api.confirmAppClose());
    };
  }, []);

  const mapItemFromApi = (item) => ({
    descricao: item.descricao || '',
    produto_planejado_id: item.produto_planejado_id ? String(item.produto_planejado_id) : '',
    largura: item.largura ?? '',
    profundidade: item.profundidade ?? '',
    altura: item.altura ?? '',
    espessura_mdf: item.espessura_mdf ?? 18,
    padrao_mdf: item.padrao_mdf || '',
    tipo_fundo: item.tipo_fundo || 'fino',
    tipo_fundo_outro: item.tipo_fundo_outro || '',
    tipo_porta: item.tipo_porta || 'sem_porta',
    tipo_porta_outro: item.tipo_porta_outro || '',
    tipo_puxador: item.tipo_puxador || 'sem_puxador',
    tipo_puxador_outro: item.tipo_puxador_outro || '',
    cor_puxador: item.cor_puxador || '',
    tipo_corredicas: item.tipo_corredicas || 'sem_corredicas',
    tipo_corredicas_outro: item.tipo_corredicas_outro || '',
    canaleta_led: Boolean(item.canaleta_led),
    itens_extra: item.itens_extra || '',
    quantidade: item.quantidade ?? 1,
    preco_unitario: Number(item.preco_unitario) || 0,
  });

  const hydrateFromPlanejado = (orc) => {
    setNumero(orc.numero);
    setClienteId(String(orc.cliente_id));
    setVendedorId(orc.vendedor_id ? String(orc.vendedor_id) : '');
    setClienteSelecionado({
      id: orc.cliente_id,
      nome: orc.cliente_nome,
      cpf_cnpj: orc.cliente_cpf_cnpj,
      telefone: orc.cliente_telefone,
      email: orc.cliente_email,
      cidade: orc.cliente_cidade,
      estado: orc.cliente_estado,
    });
    setStatus(orc.status);
    setValidadeDias(orc.validade_dias || 30);
    if (orc.prazo_entrega_outro) {
      setPrazoEntrega('outro');
      setPrazoEntregaOutro(orc.prazo_entrega_outro);
    } else {
      setPrazoEntrega(String(orc.prazo_entrega_dias || PRAZO_ENTREGA_PADRAO));
      setPrazoEntregaOutro('');
    }
    setObservacoes(orc.observacoes || '');
    setFormasPagamento(orc.formas_pagamento || FORMAS_PAGAMENTO_PADRAO);
    setAmbientes(mapAmbientesFromPlanejado(orc.ambientes || []));
  };

  useEffect(() => {
    (async () => {
      if (skipLoadRef.current) {
        skipLoadRef.current = false;
        return;
      }

      setBaselineSnapshot(null);
      try {
        const templates = await api.listProdutosPlanejados('');
        setProdutosPlanejados(templates);

        if (!isNew) {
          setLoading(true);
          const orc = await api.getOrcamentoPlanejado(Number(id));
          const vendedorAtual = orc.vendedor_id ? String(orc.vendedor_id) : '';
          const v = await loadVendedoresPorClassificacao(api, VENDEDOR_CLASSIFICACAO_PLANEJADOS, vendedorAtual);
          setVendedores(v);
          hydrateFromPlanejado(orc);
          setBaselineSnapshot(snapshotFromPlanejado(orc));
        } else {
          const vidInicial = meuVendedorId || '';
          const v = await loadVendedoresPorClassificacao(api, VENDEDOR_CLASSIFICACAO_PLANEJADOS, vidInicial);
          setVendedores(v);
          setVendedorId(vidInicial);
          setBaselineSnapshot(buildOrcamentoPlanejadoSnapshot({
            clienteId: '',
            vendedorId: vidInicial,
            status: 'rascunho',
            validadeDias: 30,
            prazoEntrega: String(PRAZO_ENTREGA_PADRAO),
            prazoEntregaOutro: '',
            observacoes: '',
            formasPagamento: FORMAS_PAGAMENTO_PADRAO,
            ambientes: [emptyAmbiente()],
          }));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  const updateAmbienteNome = (index, nome) => {
    setAmbientes((prev) => prev.map((amb, i) => (i === index ? { ...amb, nome } : amb)));
  };

  const applyTemplateToItem = (ambienteIndex, itemIndex, template) => {
    setAmbientes((prev) => prev.map((amb, ai) => {
      if (ai !== ambienteIndex) return amb;
      return {
        ...amb,
        itens: amb.itens.map((item, ii) => (
          ii === itemIndex ? aplicarTemplatePlanejado(item, template) : item
        )),
      };
    }));
  };

  const updateItem = (ambienteIndex, itemIndex, field, value) => {
    setAmbientes((prev) => prev.map((amb, ai) => {
      if (ai !== ambienteIndex) return amb;
      return {
        ...amb,
        itens: amb.itens.map((item, ii) => (ii === itemIndex ? { ...item, [field]: value } : item)),
      };
    }));
  };

  const removeItem = (ambienteIndex, itemIndex) => {
    setAmbientes((prev) => prev.map((amb, ai) => {
      if (ai !== ambienteIndex) return amb;
      return { ...amb, itens: amb.itens.filter((_, ii) => ii !== itemIndex) };
    }));
  };

  const addItem = (ambienteIndex) => {
    setAmbientes((prev) => prev.map((amb, i) => (
      i === ambienteIndex ? { ...amb, itens: [...amb.itens, criarItemPlanejado()] } : amb
    )));
  };

  const addAmbiente = () => {
    setAmbientes((prev) => [...prev, emptyAmbiente()]);
  };

  const removeAmbiente = (index) => {
    if (ambientes.length === 1) {
      setError('O orçamento precisa ter pelo menos um ambiente.');
      return;
    }
    setAmbientes((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFormaPagamento = (index, field, value) => {
    setFormasPagamento((prev) => prev.map((f, i) => (
      i === index ? { ...f, [field]: field === 'desconto_percentual' ? Number(value) : value } : f
    )));
  };

  const addFormaPagamento = () => {
    setFormasPagamento((prev) => [...prev, criarFormaPagamento()]);
  };

  const removeFormaPagamento = (index) => {
    if (formasPagamento.length <= 1) {
      setError('O orçamento precisa ter pelo menos uma forma de pagamento.');
      return;
    }
    setFormasPagamento((prev) => prev.filter((_, i) => i !== index));
    setError('');
  };

  const abrirClienteModal = (cliente = null) => {
    setClienteModalCliente(cliente);
    setShowClienteModal(true);
  };

  const handleSaveCliente = async (data) => {
    const cliente = clienteModalCliente
      ? await api.updateCliente(clienteModalCliente.id, data)
      : await api.createCliente(data);
    setClienteSelecionado(cliente);
    setClienteId(String(cliente.id));
    setShowClienteModal(false);
    setClienteModalCliente(null);
    showSuccess(clienteModalCliente ? 'Cliente atualizado.' : 'Cliente cadastrado e selecionado.');
  };

  const handleSelectCliente = (cliente) => {
    setClienteSelecionado(cliente);
    setClienteId(String(cliente.id));
  };

  const executeExit = (action) => {
    if (!action) return;
    if (action.type === 'navigate') {
      navigate(action.to);
    } else if (action.type === 'close') {
      api.confirmAppClose();
    }
  };

  const requestExit = (action) => {
    if (isDirty) {
      setExitPrompt(action);
    } else {
      executeExit(action);
    }
  };

  const buildPayload = () => ({
    cliente_id: Number(clienteId),
    vendedor_id: vendedorId ? Number(vendedorId) : null,
    status,
    validade_dias: Number(validadeDias),
    prazo_entrega_dias: prazoEntrega === 'outro' ? null : Number(prazoEntrega),
    prazo_entrega_outro: prazoEntrega === 'outro' ? prazoEntregaOutro.trim() : null,
    observacoes,
    formas_pagamento: formasPagamento,
    ambientes: ambientes.map((ambiente) => ({
      nome: ambiente.nome.trim() || AMBIENTE_NOME_PADRAO,
      itens: ambiente.itens.filter((item) => item.descricao?.trim()),
    })),
  });

  const handleSave = async ({ stayOnPage = false } = {}) => {
    setSaving(true);
    setError('');
    try {
      if (!clienteId) throw new Error('Selecione um cliente.');
      if (prazoEntrega === 'outro' && !prazoEntregaOutro.trim()) {
        throw new Error('Informe o prazo de entrega personalizado.');
      }
      const saved = await api.saveOrcamentoPlanejado(buildPayload(), isNew ? null : Number(id));
      hydrateFromPlanejado(saved);
      setBaselineSnapshot(snapshotFromPlanejado(saved));
      isDirtyRef.current = false;
      showSuccess(isNew ? 'Orçamento planejado criado.' : 'Orçamento planejado salvo.');
      if (isNew && !stayOnPage) {
        skipLoadRef.current = true;
        navigate(`/ferramentas-venda/orcamentos-planejados/${saved.id}`, { replace: true });
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
          const result = await api.gerarPdfOrcamentoPlanejado(Number(id));
          if (result.cancelled) return result;
          return result;
        },
        {
          loading: 'Gerando PDF do orçamento...',
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
      setError('Salve o orçamento antes de gerar o PDF.');
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
    } else {
      executeExit(action);
    }
  };

  const handleConfirmDiscard = async () => {
    const action = exitPrompt;
    setExitPrompt(null);
    if (action?.type === 'pdf') {
      await gerarPdfInternal();
    } else {
      executeExit(action);
    }
  };

  if (loading) {
    return <div className="loading">Carregando orçamento...</div>;
  }

  return (
    <>
      <header className="page-header">
        <h2>{isNew ? 'Novo orçamento planejado' : `Orçamento planejado ${numero}`}</h2>
        <p>Cadastre cada móvel sob medida com especificações técnicas — sem vínculo com o catálogo de produtos</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="card">
        <div className="card-header">Dados do orçamento</div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Cliente *</label>
              {clienteSelecionado ? (
                <div className="cliente-selecionado-card">
                  <div className="cliente-selecionado-info">
                    <strong>{clienteSelecionado.nome}</strong>
                    <span>
                      {[clienteSelecionado.cpf_cnpj, clienteSelecionado.telefone, clienteSelecionado.cidade]
                        .filter(Boolean).join(' · ') || 'Sem dados adicionais'}
                    </span>
                  </div>
                  <div className="inline-field">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowSelecionarCliente(true)}>
                      Alterar cliente
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirClienteModal()}>
                      + Novo cliente
                    </button>
                  </div>
                </div>
              ) : (
                <div className="inline-field">
                  <button type="button" className="btn btn-primary" onClick={() => setShowSelecionarCliente(true)}>
                    Selecionar cliente
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirClienteModal()}>
                    + Novo cliente
                  </button>
                </div>
              )}
              {clienteSelecionado && (
                <ClienteDadosResumo
                  cliente={clienteSelecionado}
                  variant="orcamento"
                  onEditar={() => abrirClienteModal(clienteSelecionado)}
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="vendedor">Vendedor</label>
              {vendedorBloqueado ? (
                <input
                  id="vendedor"
                  value={vendedores.find((v) => String(v.id) === vendedorId)?.nome || user?.nome || '—'}
                  readOnly
                  className="input-readonly"
                />
              ) : (
                <div className="inline-field">
                  <select id="vendedor" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>{v.nome}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Etapa no kanban</label>
              <input value={STATUS_LABEL[status] || status} readOnly className="input-readonly" />
              <span className="hint-text">Mova o card na tela de Orçamentos planejados.</span>
            </div>

            <div className="form-group">
              <label htmlFor="validade_dias">Validade do orçamento</label>
              <select id="validade_dias" value={validadeDias} onChange={(e) => setValidadeDias(Number(e.target.value))}>
                {VALIDADE_DIAS_OPTIONS.map((dias) => (
                  <option key={dias} value={dias}>{dias} dias</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="prazo_entrega">Prazo de entrega</label>
              <select
                id="prazo_entrega"
                value={prazoEntrega}
                onChange={(e) => setPrazoEntrega(e.target.value)}
              >
                {PRAZO_ENTREGA_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>{o.label}</option>
                ))}
              </select>
            </div>

            {prazoEntrega === 'outro' && (
              <div className="form-group">
                <label htmlFor="prazo_entrega_outro">Prazo personalizado</label>
                <input
                  id="prazo_entrega_outro"
                  value={prazoEntregaOutro}
                  onChange={(e) => setPrazoEntregaOutro(e.target.value)}
                  placeholder="Ex: 75 dias, conforme projeto..."
                />
              </div>
            )}

            <div className="form-group full-width">
              <label htmlFor="observacoes">Observações</label>
              <textarea id="observacoes" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <section className="ambientes-section">
        <header className="ambientes-section-header">
          <h3>Ambientes e móveis</h3>
          <p>Cada móvel é cadastrado individualmente com suas medidas e acabamentos</p>
        </header>

        {ambientes.map((ambiente, ambienteIndex) => (
          <div key={ambienteIndex} className="card ambiente-card ambiente-card-highlight">
            <div className="card-header ambiente-card-header">
              <div className="ambiente-nome-wrap">
                <label htmlFor={`ambiente-${ambienteIndex}`}>Nome do ambiente</label>
                <input
                  id={`ambiente-${ambienteIndex}`}
                  className="ambiente-nome-input ambiente-nome-input-lg"
                  value={ambiente.nome}
                  onChange={(e) => updateAmbienteNome(ambienteIndex, e.target.value)}
                  placeholder={`Padrão: ${AMBIENTE_NOME_PADRAO}`}
                />
              </div>
              {ambientes.length > 1 && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeAmbiente(ambienteIndex)}>
                  Remover ambiente
                </button>
              )}
            </div>
            <div className="card-body">
              {ambiente.itens.length === 0 ? (
                <div className="empty-state ambiente-empty">
                  Nenhum móvel neste ambiente. Clique em &quot;Adicionar móvel&quot;.
                </div>
              ) : (
                <div className="planejado-itens-list">
                  {ambiente.itens.map((item, itemIndex) => (
                    <OrcamentoPlanejadoItemForm
                      key={itemIndex}
                      item={item}
                      itemIndex={itemIndex}
                      produtosPlanejados={produtosPlanejados}
                      onApplyTemplate={(idx, template) => applyTemplateToItem(ambienteIndex, idx, template)}
                      onChange={(idx, field, value) => updateItem(ambienteIndex, idx, field, value)}
                      onRemove={(idx) => removeItem(ambienteIndex, idx)}
                    />
                  ))}
                </div>
              )}
              <div className="toolbar ambiente-toolbar" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn btn-primary" onClick={() => addItem(ambienteIndex)}>
                  + Adicionar móvel
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="ambiente-add-bar">
          <button type="button" className="btn btn-primary btn-lg" onClick={addAmbiente}>
            + Adicionar ambiente
          </button>
        </div>
      </section>

      <div className="card">
        <div className="card-header">Formas de pagamento e descontos</div>
        <div className="card-body">
          <p className="hint-text">Configure as condições de pagamento após definir os móveis. O total de cada linha é calculado sobre o subtotal.</p>
          <table>
            <thead>
              <tr>
                <th>Forma de pagamento</th>
                <th>Desconto (%)</th>
                <th>Total com desconto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {formasPagamento.map((forma, index) => (
                <tr key={forma.id}>
                  <td>
                    <input
                      value={forma.nome}
                      onChange={(e) => updateFormaPagamento(index, 'nome', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <NumericInput
                      step="0.01"
                      min="0"
                      max="100"
                      value={forma.desconto_percentual}
                      onChange={(value) => updateFormaPagamento(index, 'desconto_percentual', value)}
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>{formatCurrency(calcularTotalComDesconto(subtotal, forma.desconto_percentual))}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeFormaPagamento(index)}
                      disabled={formasPagamento.length <= 1}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={addFormaPagamento}>
              + Adicionar forma de pagamento
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="totals-box">
            <div className="total-line total-line-highlight">
              <span>Total do orçamento:</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="form-actions page-footer-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => requestExit({ type: 'navigate', to: '/ferramentas-venda/orcamentos-planejados' })}
        >
          Voltar
        </button>
        <button type="button" className="btn btn-primary" onClick={() => handleSave()} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar orçamento'}
        </button>
        {!isNew && (
          <button type="button" className="btn btn-primary" onClick={handleGerarPdf} disabled={generatingPdf}>
            {generatingPdf ? 'Gerando PDF...' : 'Gerar PDF'}
          </button>
        )}
      </div>

      {showSelecionarCliente && (
        <SelecionarClienteModal
          clienteAtualId={clienteId}
          onClose={() => setShowSelecionarCliente(false)}
          onSelect={handleSelectCliente}
          onNovoCliente={() => {
            setShowSelecionarCliente(false);
            abrirClienteModal();
          }}
        />
      )}

      {showClienteModal && (
        <ClienteModal
          cliente={clienteModalCliente}
          context="orcamento"
          onClose={() => { setShowClienteModal(false); setClienteModalCliente(null); }}
          onSave={handleSaveCliente}
        />
      )}

      {exitPrompt && (
        <ConfirmarSaidaModal
          documentLabel="orçamento planejado"
          variant={exitPrompt.type === 'pdf' ? 'pdf' : 'exit'}
          saving={saving}
          onSalvar={handleConfirmSave}
          onDescartar={handleConfirmDiscard}
          onCancelar={() => setExitPrompt(null)}
        />
      )}
    </>
  );
}
