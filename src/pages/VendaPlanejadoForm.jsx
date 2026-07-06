import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import {
  AMBIENTE_NOME_PADRAO,
  PRAZO_ENTREGA_OPTIONS,
  PRAZO_ENTREGA_PADRAO,
  criarItemPlanejado,
  aplicarTemplatePlanejado,
} from '../constants/orcamentoPlanejado';
import {
  calcularTotalPagamentos,
  criarPagamento,
  formaPermiteParcelas,
  calcularSubtotalItens,
} from '../constants/venda';
import { calcularAjustePagamentoSubtotal } from '../constants/pagamento';
import { formatCurrency } from '../utils/format';
import {
  buildVendaPlanejadoSnapshot,
  snapshotFromVendaPlanejado,
} from '../utils/vendaPlanejadoSnapshot';
import { mapAmbientesFromPlanejado } from '../utils/orcamentoPlanejadoSnapshot';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import ClienteModal from '../components/ClienteModal';
import ClienteDadosResumo from '../components/ClienteDadosResumo';
import ConfirmarSaidaModal from '../components/ConfirmarSaidaModal';
import NumericInput from '../components/NumericInput';
import OrcamentoPlanejadoItemForm from '../components/OrcamentoPlanejadoItemForm';
import SelecionarClienteModal from '../components/SelecionarClienteModal';
import SelecionarOrcamentoPlanejadoModal from '../components/SelecionarOrcamentoPlanejadoModal';
import { VENDEDOR_CLASSIFICACAO_PLANEJADOS } from '../constants/vendedor';
import { loadVendedoresPorClassificacao } from '../utils/loadVendedores';
import { useAuth } from '../context/AuthContext';
import { isVendedorRestrito, getVendedorIdUsuario } from '../utils/vendedorRestrito';
import { clienteProntoParaVenda, mensagemClienteIncompletoVenda } from '../utils/clienteDados';

const listPath = '/ferramentas-venda/vendas-planejados';

const ANEXOS_ACEITOS = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const EXTENSOES_ANEXO_PERMITIDAS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const MIME_ANEXO_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function anexoPermitido(file) {
  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
  return EXTENSOES_ANEXO_PERMITIDAS.has(ext) || MIME_ANEXO_PERMITIDOS.has((file.type || '').toLowerCase());
}

function emptyAmbiente() {
  return { nome: '', itens: [] };
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function VendaPlanejadoForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [setupStep, setSetupStep] = useState(isNew ? 'choose' : 'form');
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [formasCadastro, setFormasCadastro] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState('');
  const { success: showSuccess, info: showInfo } = useFeedback();
  const { user } = useAuth();
  const vendedorBloqueado = isVendedorRestrito(user);
  const meuVendedorId = getVendedorIdUsuario(user);

  const [numero, setNumero] = useState('');
  const [numeroPedido, setNumeroPedido] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [orcamentoPlanejadoId, setOrcamentoPlanejadoId] = useState('');
  const [orcamentoPlanejadoNumero, setOrcamentoPlanejadoNumero] = useState('');
  const [prazoEntrega, setPrazoEntrega] = useState(String(PRAZO_ENTREGA_PADRAO));
  const [prazoEntregaOutro, setPrazoEntregaOutro] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [medidasConferidas, setMedidasConferidas] = useState(false);
  const [responsavelMedidas, setResponsavelMedidas] = useState('');
  const [pagamentos, setPagamentos] = useState([criarPagamento()]);
  const [ambientes, setAmbientes] = useState([emptyAmbiente()]);
  const [anexos, setAnexos] = useState([]);
  const [produtosPlanejados, setProdutosPlanejados] = useState([]);

  const [showClienteModal, setShowClienteModal] = useState(false);
  const [clienteModalCliente, setClienteModalCliente] = useState(null);
  const [showSelecionarCliente, setShowSelecionarCliente] = useState(false);
  const [showSelecionarOrcamento, setShowSelecionarOrcamento] = useState(false);
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [exitPrompt, setExitPrompt] = useState(null);
  const isDirtyRef = useRef(false);
  const skipLoadRef = useRef(false);
  const fileInputRef = useRef(null);

  const subtotal = useMemo(() => calcularSubtotalItens(ambientes), [ambientes]);
  const totalPago = useMemo(() => calcularTotalPagamentos(pagamentos), [pagamentos]);
  const { descontoExtra, acrescimoExtra, temAjustePreco } = useMemo(
    () => calcularAjustePagamentoSubtotal(subtotal, totalPago),
    [subtotal, totalPago]
  );

  const vendedorNome = useMemo(
    () => vendedores.find((v) => String(v.id) === vendedorId)?.nome || '',
    [vendedores, vendedorId]
  );

  const getFormState = () => ({
    clienteId,
    vendedorId,
    orcamentoPlanejadoId,
    numeroPedido,
    prazoEntrega,
    prazoEntregaOutro,
    observacoes,
    medidasConferidas,
    responsavelMedidas,
    pagamentos,
    ambientes,
    anexos,
  });

  const currentSnapshot = useMemo(
    () => buildVendaPlanejadoSnapshot(getFormState()),
    [clienteId, vendedorId, orcamentoPlanejadoId, numeroPedido, prazoEntrega, prazoEntregaOutro,
      observacoes, medidasConferidas, responsavelMedidas, pagamentos, ambientes, anexos]
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

  const hydrateFromVenda = (venda) => {
    setNumero(venda.numero || '');
    setNumeroPedido(venda.numero_pedido || '');
    setClienteId(String(venda.cliente_id));
    setVendedorId(venda.vendedor_id ? String(venda.vendedor_id) : '');
    setOrcamentoPlanejadoId(venda.orcamento_planejado_id ? String(venda.orcamento_planejado_id) : '');
    setOrcamentoPlanejadoNumero(venda.orcamento_planejado_numero || '');
    setClienteSelecionado({
      id: venda.cliente_id,
      nome: venda.cliente_nome,
      cpf_cnpj: venda.cliente_cpf_cnpj,
      telefone: venda.cliente_telefone,
      email: venda.cliente_email,
      cidade: venda.cliente_cidade,
      estado: venda.cliente_estado,
    });
    if (venda.prazo_entrega_outro) {
      setPrazoEntrega('outro');
      setPrazoEntregaOutro(venda.prazo_entrega_outro);
    } else {
      setPrazoEntrega(String(venda.prazo_entrega_dias || PRAZO_ENTREGA_PADRAO));
      setPrazoEntregaOutro('');
    }
    setObservacoes(venda.observacoes || '');
    setMedidasConferidas(Boolean(venda.medidas_conferidas));
    setResponsavelMedidas(venda.responsavel_medidas || '');
    setPagamentos(
      venda.pagamentos?.length > 0
        ? venda.pagamentos.map((p) => ({
          id: p.id,
          forma_pagamento_id: p.forma_pagamento_id ? String(p.forma_pagamento_id) : '',
          valor: Number(p.valor) || 0,
          parcelas: Number(p.parcelas) || 1,
          observacao: p.observacao || '',
        }))
        : [criarPagamento(formasCadastro[0]?.id)]
    );
    setAmbientes(mapAmbientesFromPlanejado(venda.ambientes || []));
    setAnexos((venda.anexos || []).map((a) => ({
      id: a.id,
      nome_original: a.nome_original,
      tamanho_bytes: a.tamanho_bytes,
      mime_type: a.mime_type,
    })));
  };

  const loadReferencias = async (vendedorAtual = '') => {
    const [v, formas, templates] = await Promise.all([
      loadVendedoresPorClassificacao(api, VENDEDOR_CLASSIFICACAO_PLANEJADOS, vendedorAtual),
      api.listFormasPagamento(''),
      api.listProdutosPlanejados(''),
    ]);
    setVendedores(v);
    setFormasCadastro(formas);
    setProdutosPlanejados(templates);
    return formas;
  };

  const applyOrcamentoData = (orc, formas = formasCadastro) => {
    setOrcamentoPlanejadoId(String(orc.id));
    setOrcamentoPlanejadoNumero(orc.numero);
    setClienteId(String(orc.cliente_id));
    setClienteSelecionado({
      id: orc.cliente_id,
      nome: orc.cliente_nome,
      cpf_cnpj: orc.cliente_cpf_cnpj,
      telefone: orc.cliente_telefone,
      email: orc.cliente_email,
      cidade: orc.cliente_cidade,
      estado: orc.cliente_estado,
    });
    setObservacoes(orc.observacoes || '');
    setVendedorId(vendedorBloqueado ? (meuVendedorId || '') : (orc.vendedor_id ? String(orc.vendedor_id) : ''));
    if (orc.prazo_entrega_outro) {
      setPrazoEntrega('outro');
      setPrazoEntregaOutro(orc.prazo_entrega_outro);
    } else {
      setPrazoEntrega(String(orc.prazo_entrega_dias || PRAZO_ENTREGA_PADRAO));
      setPrazoEntregaOutro('');
    }
    const total = Number(orc.total) || 0;
    setPagamentos([{ ...criarPagamento(formas[0]?.id), valor: total }]);
    setAmbientes(
      orc.ambientes?.length > 0
        ? mapAmbientesFromPlanejado(orc.ambientes)
        : [emptyAmbiente()]
    );
    setSetupStep('form');
    setBaselineSnapshot(null);
    showInfo(`Dados importados do orçamento ${orc.numero}. Revise e edite antes de salvar.`);
  };

  const startBlank = () => {
    setOrcamentoPlanejadoId('');
    setOrcamentoPlanejadoNumero('');
    setNumeroPedido('');
    setClienteId('');
    setClienteSelecionado(null);
    setObservacoes('');
    setVendedorId(meuVendedorId || '');
    setPrazoEntrega(String(PRAZO_ENTREGA_PADRAO));
    setPrazoEntregaOutro('');
    setMedidasConferidas(false);
    setResponsavelMedidas('');
    setPagamentos([criarPagamento(formasCadastro[0]?.id)]);
    setAmbientes([emptyAmbiente()]);
    setAnexos([]);
    setSetupStep('form');
    setBaselineSnapshot(null);
  };

  useEffect(() => {
    (async () => {
      if (skipLoadRef.current) {
        skipLoadRef.current = false;
        return;
      }
      try {
        if (!isNew) {
          setLoading(true);
          const venda = await api.getVendaPlanejado(Number(id));
          const vid = venda.vendedor_id ? String(venda.vendedor_id) : '';
          await loadReferencias(vid);
          hydrateFromVenda(venda);
          setBaselineSnapshot(snapshotFromVendaPlanejado(venda));
        } else {
          await loadReferencias(meuVendedorId || '');
          setVendedorId(meuVendedorId || '');
          const orcParam = searchParams.get('orcamento_planejado');
          if (orcParam) {
            setLoading(true);
            const orc = await api.getOrcamentoPlanejado(Number(orcParam));
            const vid = orc.vendedor_id ? String(orc.vendedor_id) : '';
            const fp = await loadReferencias(vid);
            applyOrcamentoData(orc, fp);
            setLoading(false);
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew, searchParams]);

  const handleMedidasConferidasChange = (valor) => {
    const sim = valor === 'sim';
    setMedidasConferidas(sim);
    if (sim) {
      setResponsavelMedidas((atual) => atual || vendedorNome || user?.nome || '');
    } else {
      setResponsavelMedidas('');
    }
  };

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

  const addItem = (ambienteIndex) => {
    setAmbientes((prev) => prev.map((amb, i) => (
      i === ambienteIndex ? { ...amb, itens: [...amb.itens, criarItemPlanejado()] } : amb
    )));
  };

  const removeItem = (ambienteIndex, itemIndex) => {
    setAmbientes((prev) => prev.map((amb, ai) => {
      if (ai !== ambienteIndex) return amb;
      return { ...amb, itens: amb.itens.filter((_, ii) => ii !== itemIndex) };
    }));
  };

  const addAmbiente = () => setAmbientes((prev) => [...prev, emptyAmbiente()]);

  const removeAmbiente = (index) => {
    if (ambientes.length === 1) {
      setError('A venda precisa ter pelo menos um ambiente.');
      return;
    }
    setAmbientes((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePagamento = (index, field, value) => {
    setPagamentos((prev) => prev.map((p, i) => {
      if (i !== index) return p;
      if (field === 'forma_pagamento_id') {
        return { ...p, forma_pagamento_id: value ? String(value) : '' };
      }
      if (field === 'valor' || field === 'parcelas') {
        return { ...p, [field]: value };
      }
      return { ...p, [field]: value };
    }));
  };

  const addPagamento = () => setPagamentos((prev) => [...prev, criarPagamento(formasCadastro[0]?.id)]);
  const removePagamento = (index) => {
    if (pagamentos.length <= 1) return;
    setPagamentos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnexosSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const invalidos = files.filter((file) => !anexoPermitido(file));
    if (invalidos.length) {
      setError(`Arquivo(s) não permitido(s): ${invalidos.map((f) => f.name).join(', ')}. Use PDF, JPG, JPEG ou PNG.`);
      e.target.value = '';
      return;
    }
    try {
      const novos = await Promise.all(files.map(async (file) => ({
        id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        nome_original: file.name,
        tamanho_bytes: file.size,
        mime_type: file.type,
        base64: await readFileAsBase64(file),
        pending: true,
      })));
      setAnexos((prev) => [...prev, ...novos]);
    } catch (err) {
      setError(err.message || 'Erro ao ler arquivo.');
    }
    e.target.value = '';
  };

  const removerAnexo = (index) => {
    setAnexos((prev) => prev.map((a, i) => {
      if (i !== index) return a;
      if (a.id && !String(a.id).startsWith('tmp_')) {
        return { ...a, remover: true };
      }
      return null;
    }).filter(Boolean));
  };

  const abrirAnexo = async (anexo) => {
    if (!id || !anexo.id || String(anexo.id).startsWith('tmp_')) {
      setError('Salve a venda antes de abrir anexos novos.');
      return;
    }
    try {
      await api.abrirAnexoVendaPlanejado(Number(id), anexo.id);
    } catch (err) {
      setError(err.message);
    }
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

  const buildPayload = () => ({
    cliente_id: Number(clienteId),
    vendedor_id: vendedorId ? Number(vendedorId) : null,
    orcamento_planejado_id: orcamentoPlanejadoId ? Number(orcamentoPlanejadoId) : null,
    numero_pedido: numeroPedido,
    prazo_entrega_dias: prazoEntrega === 'outro' ? null : Number(prazoEntrega),
    prazo_entrega_outro: prazoEntrega === 'outro' ? prazoEntregaOutro : null,
    observacoes,
    medidas_conferidas: medidasConferidas,
    responsavel_medidas: medidasConferidas ? responsavelMedidas : null,
    pagamentos,
    ambientes: ambientes.map((ambiente) => ({
      nome: ambiente.nome.trim() || AMBIENTE_NOME_PADRAO,
      itens: ambiente.itens.filter((item) => item.descricao?.trim()),
    })),
    anexos: anexos.map((a) => {
      if (a.remover) return { id: a.id, remover: true };
      if (a.pending && a.base64) {
        return { nome_original: a.nome_original, base64: a.base64 };
      }
      return { id: a.id };
    }),
  });

  const handleSave = async ({ stayOnPage = false } = {}) => {
    setSaving(true);
    setError('');
    try {
      if (!clienteId) {
        throw new Error('Selecione um cliente para a venda.');
      }
      if (!clienteProntoParaVenda(clienteSelecionado)) {
        throw new Error(mensagemClienteIncompletoVenda(clienteSelecionado));
      }
      const saved = await api.saveVendaPlanejado(buildPayload(), isNew ? null : Number(id));
      hydrateFromVenda(saved);
      setBaselineSnapshot(snapshotFromVendaPlanejado(saved));
      isDirtyRef.current = false;
      showSuccess(isNew ? 'Venda planejada registrada com sucesso!' : 'Venda planejada atualizada com sucesso!');
      if (isNew && !stayOnPage) {
        skipLoadRef.current = true;
        navigate(`${listPath}/${saved.id}`, { replace: true });
      }
      return saved;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    setGeneratingPdf(true);
    setError('');
    try {
      let vendaId = isNew ? null : Number(id);
      if (isDirty || isNew) {
        const saved = await handleSave({ stayOnPage: true });
        if (!saved) return;
        vendaId = saved.id;
        if (isNew) {
          skipLoadRef.current = true;
          navigate(`${listPath}/${saved.id}`, { replace: true });
        }
      }
      const result = await api.gerarPdfVendaPlanejado(vendaId);
      if (!result.cancelled) {
        showSuccess('PDF do pedido gerado com sucesso.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const executeExit = (action) => {
    if (!action) return;
    if (action.type === 'navigate') navigate(action.to);
    else if (action.type === 'close') api.confirmAppClose();
  };

  const requestExit = (action) => {
    if (isDirty) setExitPrompt(action);
    else executeExit(action);
  };

  const handleConfirmSave = async () => {
    const action = exitPrompt;
    const saved = await handleSave({ stayOnPage: true });
    if (!saved) return;
    setExitPrompt(null);
    executeExit(action);
  };

  const handleConfirmDiscard = () => {
    const action = exitPrompt;
    setExitPrompt(null);
    executeExit(action);
  };

  const anexosVisiveis = anexos.filter((a) => !a.remover);

  if (loading) return <div className="loading">Carregando venda planejada...</div>;

  if (setupStep === 'choose') {
    return (
      <>
        <header className="page-header">
          <h2>Nova venda planejada</h2>
          <p>Escolha como deseja iniciar o pedido de móveis planejados</p>
        </header>

        {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

        <div className="venda-setup-grid">
          <button type="button" className="card venda-setup-card" onClick={() => setShowSelecionarOrcamento(true)}>
            <div className="venda-setup-icon">📋</div>
            <h3>Importar de orçamento planejado</h3>
            <p>Carregue cliente, móveis e valores de um orçamento aprovado para editar e confirmar a venda.</p>
          </button>
          <button type="button" className="card venda-setup-card" onClick={startBlank}>
            <div className="venda-setup-icon">✏️</div>
            <h3>Cadastrar nova venda</h3>
            <p>Inicie um pedido em branco e preencha cliente, móveis, pagamento e anexos manualmente.</p>
          </button>
        </div>

        <div className="form-actions page-footer-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(listPath)}>
            Voltar
          </button>
        </div>

        {showSelecionarOrcamento && (
          <SelecionarOrcamentoPlanejadoModal
            onClose={() => setShowSelecionarOrcamento(false)}
            onSelect={applyOrcamentoData}
          />
        )}
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <h2>{isNew ? 'Nova venda planejada' : `Venda planejada ${numero}`}</h2>
        <p>
          {numeroPedido ? `Pedido nº ${numeroPedido}` : 'Informe o número do pedido (5 dígitos)'}
          {orcamentoPlanejadoNumero && ` · Importada do orçamento ${orcamentoPlanejadoNumero}`}
        </p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="card">
        <div className="card-header">Dados do pedido</div>
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
                  variant="venda"
                  onEditar={() => abrirClienteModal(clienteSelecionado)}
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="vendedor">Vendedor projetista</label>
              {vendedorBloqueado ? (
                <input
                  id="vendedor"
                  value={vendedorNome || user?.nome || '—'}
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
              <label htmlFor="numero_pedido">Número do pedido *</label>
              <input
                id="numero_pedido"
                value={numeroPedido}
                onChange={(e) => setNumeroPedido(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="00000"
                maxLength={5}
              />
              <span className="hint-text">5 dígitos numéricos</span>
            </div>

            <div className="form-group">
              <label htmlFor="prazo_entrega">Prazo de entrega</label>
              <select id="prazo_entrega" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)}>
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
              <label>Medidas foram conferidas no local?</label>
              <div className="inline-field">
                <label className="radio-inline">
                  <input
                    type="radio"
                    name="medidas_conferidas"
                    checked={!medidasConferidas}
                    onChange={() => handleMedidasConferidasChange('nao')}
                  />
                  Não
                </label>
                <label className="radio-inline">
                  <input
                    type="radio"
                    name="medidas_conferidas"
                    checked={medidasConferidas}
                    onChange={() => handleMedidasConferidasChange('sim')}
                  />
                  Sim
                </label>
              </div>
            </div>

            {medidasConferidas && (
              <div className="form-group full-width">
                <label htmlFor="responsavel_medidas">Responsável pelas medidas</label>
                <input
                  id="responsavel_medidas"
                  value={responsavelMedidas}
                  onChange={(e) => setResponsavelMedidas(e.target.value)}
                  placeholder="Nome do responsável pela conferência"
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
          <p>Cada móvel com medidas e especificações técnicas</p>
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
        <div className="card-header">Pagamento do pedido</div>
        <div className="card-body">
          <p className="hint-text">
            Se o valor acordado for diferente do subtotal dos móveis, os preços unitários serão
            ajustados proporcionalmente ao salvar — inclusive para corrigir um pagamento informado
            por engano.
          </p>
          <table>
            <thead>
              <tr>
                <th>Forma</th>
                <th>Valor (R$)</th>
                <th>Parcelas</th>
                <th>Observação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagamentos.map((pag, index) => (
                <tr key={pag.id}>
                  <td>
                    <select
                      value={pag.forma_pagamento_id || ''}
                      onChange={(e) => updatePagamento(index, 'forma_pagamento_id', e.target.value)}
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
                    />
                  </td>
                  <td>
                    <NumericInput
                      min="1"
                      defaultOnEmpty={1}
                      value={pag.parcelas}
                      onChange={(value) => updatePagamento(index, 'parcelas', value)}
                      style={{ width: 70 }}
                      disabled={!formaPermiteParcelas(pag.forma_pagamento_id, formasCadastro)}
                    />
                  </td>
                  <td>
                    <input
                      value={pag.observacao}
                      onChange={(e) => updatePagamento(index, 'observacao', e.target.value)}
                      placeholder="Opcional"
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removePagamento(index)}
                      disabled={pagamentos.length <= 1}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={addPagamento}>
              + Adicionar pagamento
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Anexos</div>
        <div className="card-body">
          <p className="hint-text">
            Anexe projetos, fotos do local ou documentos em PDF. JPG, JPEG e PNG serão incorporados ao PDF do pedido, uma imagem por página.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ANEXOS_ACEITOS}
            style={{ display: 'none' }}
            onChange={handleAnexosSelected}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            + Anexar arquivos
          </button>

          {anexosVisiveis.length > 0 && (
            <ul className="anexos-list" style={{ marginTop: '1rem', listStyle: 'none', padding: 0 }}>
              {anexosVisiveis.map((anexo) => (
                <li key={anexo.id} className="inline-field" style={{ marginBottom: '0.5rem' }}>
                  <span>
                    📎 {anexo.nome_original}
                    {anexo.tamanho_bytes ? ` (${formatFileSize(anexo.tamanho_bytes)})` : ''}
                    {anexo.pending ? ' — novo' : ''}
                  </span>
                  {!anexo.pending && id && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirAnexo(anexo)}>
                      Abrir
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removerAnexo(anexos.findIndex((a) => a.id === anexo.id))}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="totals-box">
            <div className="total-line"><span>Subtotal dos móveis:</span> <strong>{formatCurrency(subtotal)}</strong></div>
            <div className="total-line"><span>Valor acordado (soma dos pagamentos):</span> <strong>{formatCurrency(totalPago)}</strong></div>
            {descontoExtra > 0.005 && (
              <div className="total-line">
                <span>Desconto:</span>
                <strong>{formatCurrency(descontoExtra)}</strong>
              </div>
            )}
            {acrescimoExtra > 0.005 && (
              <div className="total-line">
                <span>Ajuste nos preços (pagamento maior que o subtotal):</span>
                <strong>{formatCurrency(acrescimoExtra)}</strong>
              </div>
            )}
            {temAjustePreco && (
              <p className="hint-text" style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                Ao salvar, cada preço unitário será ajustado proporcionalmente para refletir o valor acordado.
              </p>
            )}
            <div className="total-line total-line-highlight">
              <span>Valor final do pedido:</span>
              <strong>{formatCurrency(totalPago)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="form-actions page-footer-actions">
        <button type="button" className="btn btn-secondary" onClick={() => requestExit({ type: 'navigate', to: listPath })}>
          Voltar
        </button>
        <button type="button" className="btn btn-secondary" onClick={handlePrint} disabled={saving || generatingPdf}>
          {generatingPdf ? 'Gerando PDF...' : 'Imprimir'}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => handleSave()} disabled={saving || generatingPdf}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {showSelecionarCliente && (
        <SelecionarClienteModal
          onClose={() => setShowSelecionarCliente(false)}
          onSelect={(cliente) => {
            setClienteSelecionado(cliente);
            setClienteId(String(cliente.id));
          }}
        />
      )}
      {showClienteModal && (
        <ClienteModal
          cliente={clienteModalCliente}
          context="venda"
          onClose={() => { setShowClienteModal(false); setClienteModalCliente(null); }}
          onSave={handleSaveCliente}
        />
      )}
      {exitPrompt && (
        <ConfirmarSaidaModal
          onCancel={() => setExitPrompt(null)}
          onDiscard={handleConfirmDiscard}
          onSave={handleConfirmSave}
        />
      )}
    </>
  );
}
