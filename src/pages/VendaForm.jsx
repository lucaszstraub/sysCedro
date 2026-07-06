import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { calcularTotalPagamentos,
  criarPagamento,
  formaPermiteParcelas,
} from '../constants/venda';
import { mapPagamentosFromApi, calcularAjustePagamentoSubtotal } from '../constants/pagamento';
import { TIPO_LIBERACAO_OPTIONS } from '../constants/entregas';
import { AMBIENTE_NOME_PADRAO, resolverValorPedidoDesdeOrcamento } from '../constants/orcamento';
import { formatCurrency } from '../utils/format';
import { buildVendaSnapshot } from '../utils/vendaSnapshot';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import ClienteModal from '../components/ClienteModal';
import ClienteDadosResumo from '../components/ClienteDadosResumo';
import ConfirmarSaidaModal from '../components/ConfirmarSaidaModal';
import NumericInput from '../components/NumericInput';
import ProdutoModal from '../components/ProdutoModal';
import SelecionarClienteModal from '../components/SelecionarClienteModal';
import SelecionarOrcamentoModal from '../components/SelecionarOrcamentoModal';
import SelecionarProdutoModal from '../components/SelecionarProdutoModal';
import { VENDEDOR_CLASSIFICACAO_MOVEIS_SOLTOS } from '../constants/vendedor';
import { loadVendedoresPorClassificacao } from '../utils/loadVendedores';
import { useAuth } from '../context/AuthContext';
import { isVendedorRestrito, getVendedorIdUsuario } from '../utils/vendedorRestrito';
import { clienteProntoParaVenda, mensagemClienteIncompletoVenda } from '../utils/clienteDados';
import ProdutoThumb from '../components/ProdutoThumb';
import { calcularSubtotalItensEfetivos, STATUS_ITEM_VENDA_OPTIONS } from '../constants/vendaItemStatus';

const listPath = '/ferramentas-venda/vendas';

function emptyItem() {
  return {
    produto_id: null,
    descricao: '',
    quantidade: 1,
    quantidade_estoque: 1,
    quantidade_encomenda: 0,
    preco_unitario: 0,
    status: 'efetivo',
  };
}

function emptyAmbiente() {
  return { nome: '', itens: [] };
}

function mapAmbientesFromDb(ambientes) {
  return ambientes.map((ambiente) => ({
    nome: ambiente.nome,
    itens: ambiente.itens.map((item) => ({
      produto_id: item.produto_id,
      descricao: item.descricao,
      quantidade: item.quantidade,
      quantidade_estoque: item.quantidade_estoque ?? item.quantidade,
      quantidade_encomenda: item.quantidade_encomenda ?? 0,
      preco_unitario: Number(item.preco_unitario),
      ...(item.preco_unitario_lista != null
        ? { preco_unitario_lista: Number(item.preco_unitario_lista) }
        : {}),
      status: item.status || 'efetivo',
    })),
  }));
}

function formStateFromVenda(venda) {
  return {
    clienteId: String(venda.cliente_id),
    vendedorId: venda.vendedor_id ? String(venda.vendedor_id) : '',
    orcamentoId: venda.orcamento_id ? String(venda.orcamento_id) : '',
    numeroPedido: venda.numero_pedido || '',
    observacoes: venda.observacoes || '',
    entregaTipoLiberacao: venda.entrega_tipo_liberacao || 'parcial',
    pagamentos: (venda.pagamentos?.length > 0 ? venda.pagamentos : [criarPagamento()]).map((p) => ({
      id: p.id,
      forma_pagamento_id: p.forma_pagamento_id ? String(p.forma_pagamento_id) : '',
      valor: Number(p.valor) || 0,
      parcelas: Number(p.parcelas) || 1,
      observacao: p.observacao || '',
    })),
    ambientes: mapAmbientesFromDb(venda.ambientes || []),
  };
}

function snapshotFromVenda(venda) {
  return buildVendaSnapshot(formStateFromVenda(venda));
}

export default function VendaForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [setupStep, setSetupStep] = useState(isNew ? 'choose' : 'form');
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [formasCadastro, setFormasCadastro] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState('');
  const { success: showSuccess, info: showInfo, runWithFeedback } = useFeedback();
  const { user } = useAuth();
  const vendedorBloqueado = isVendedorRestrito(user);
  const meuVendedorId = getVendedorIdUsuario(user);

  const [numero, setNumero] = useState('');
  const [numeroPedido, setNumeroPedido] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [orcamentoId, setOrcamentoId] = useState('');
  const [orcamentoNumero, setOrcamentoNumero] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [entregaTipoLiberacao, setEntregaTipoLiberacao] = useState('parcial');
  const [pagamentos, setPagamentos] = useState([criarPagamento()]);
  const [ambientes, setAmbientes] = useState([emptyAmbiente()]);

  const [showClienteModal, setShowClienteModal] = useState(false);
  const [clienteModalCliente, setClienteModalCliente] = useState(null);
  const [showSelecionarCliente, setShowSelecionarCliente] = useState(false);
  const [showSelecionarOrcamento, setShowSelecionarOrcamento] = useState(false);
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [showSelecionarProduto, setShowSelecionarProduto] = useState(false);
  const [produtoModalAmbienteIndex, setProdutoModalAmbienteIndex] = useState(0);
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [exitPrompt, setExitPrompt] = useState(null);
  const isDirtyRef = useRef(false);
  const skipLoadRef = useRef(false);

  const getFormState = () => ({
    clienteId,
    vendedorId,
    orcamentoId,
    numeroPedido,
    observacoes,
    entregaTipoLiberacao,
    pagamentos,
    ambientes,
  });

  const currentSnapshot = useMemo(
    () => buildVendaSnapshot(getFormState()),
    [clienteId, vendedorId, orcamentoId, numeroPedido, observacoes, entregaTipoLiberacao, pagamentos, ambientes]
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

  const hydrateFromVenda = (venda) => {
    setNumero(venda.numero || '');
    setNumeroPedido(venda.numero_pedido || '');
    setClienteId(String(venda.cliente_id));
    setClienteSelecionado({
      id: venda.cliente_id,
      nome: venda.cliente_nome,
      cpf_cnpj: venda.cliente_cpf_cnpj,
      telefone: venda.cliente_telefone,
      email: venda.cliente_email,
      cidade: venda.cliente_cidade,
      estado: venda.cliente_estado,
    });
    setOrcamentoId(venda.orcamento_id ? String(venda.orcamento_id) : '');
    setOrcamentoNumero(venda.orcamento_numero || '');
    setVendedorId(venda.vendedor_id ? String(venda.vendedor_id) : '');
    setObservacoes(venda.observacoes || '');
    setEntregaTipoLiberacao(venda.entrega_tipo_liberacao || 'parcial');
    setPagamentos((venda.pagamentos || []).map((p) => ({
      id: p.id,
      forma_pagamento_id: p.forma_pagamento_id ? String(p.forma_pagamento_id) : '',
      valor: Number(p.valor) || 0,
      parcelas: Number(p.parcelas) || 1,
      observacao: p.observacao || '',
    })));
    setAmbientes(mapAmbientesFromDb(venda.ambientes || []));
  };

  useEffect(() => {
    if (!loading && setupStep === 'form' && baselineSnapshot === null && isNew) {
      setBaselineSnapshot(currentSnapshot);
    }
  }, [loading, setupStep, baselineSnapshot, currentSnapshot, isNew]);

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

  const subtotal = useMemo(
    () => calcularSubtotalItensEfetivos(ambientes),
    [ambientes]
  );

  const totalPago = useMemo(() => calcularTotalPagamentos(pagamentos), [pagamentos]);
  const { descontoExtra, acrescimoExtra, temAjustePreco } = useMemo(
    () => calcularAjustePagamentoSubtotal(subtotal, totalPago),
    [subtotal, totalPago]
  );

  const loadReferencias = async (vendedorAtual = vendedorId) => {
    const [cat, f, v, fp] = await Promise.all([
      api.listCategorias(),
      api.listFornecedores(),
      loadVendedoresPorClassificacao(api, VENDEDOR_CLASSIFICACAO_MOVEIS_SOLTOS, vendedorAtual),
      api.listFormasPagamento(),
    ]);
    setCategorias(cat);
    setFornecedores(f);
    setVendedores(v);
    setFormasCadastro(fp);
    return fp;
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
          const venda = await api.getVenda(Number(id));
          const vid = venda.vendedor_id ? String(venda.vendedor_id) : '';
          await loadReferencias(vid);
          hydrateFromVenda(venda);
          setBaselineSnapshot(snapshotFromVenda(venda));
        } else {
          await loadReferencias();
          const orcamentoParam = searchParams.get('orcamento');
          if (orcamentoParam) {
            setLoading(true);
            const orc = await api.getOrcamento(Number(orcamentoParam));
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

  const applyOrcamentoData = (orc, formas = formasCadastro) => {
    setOrcamentoId(String(orc.id));
    setOrcamentoNumero(orc.numero);
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
    const valorPedido = resolverValorPedidoDesdeOrcamento(orc);
    setPagamentos([{ ...criarPagamento(formas[0]?.id), valor: valorPedido }]);
    setAmbientes(orc.ambientes.length > 0 ? mapAmbientesFromDb(orc.ambientes).map((amb) => ({
      ...amb,
      itens: amb.itens.map((item) => ({
        ...item,
        quantidade_estoque: item.quantidade_estoque ?? item.quantidade,
        quantidade_encomenda: item.quantidade_encomenda ?? 0,
      })),
    })) : [emptyAmbiente()]);
    setSetupStep('form');
    setBaselineSnapshot(null);
    showInfo(`Dados importados do orçamento ${orc.numero}. Configure as formas de pagamento do pedido.`);
  };

  const startBlank = () => {
    setOrcamentoId('');
    setOrcamentoNumero('');
    setNumeroPedido('');
    setClienteId('');
    setClienteSelecionado(null);
    setObservacoes('');
    setVendedorId(meuVendedorId || '');
    setPagamentos([criarPagamento(formasCadastro[0]?.id)]);
    setAmbientes([emptyAmbiente()]);
    setSetupStep('form');
    setBaselineSnapshot(null);
  };

  const updateAmbienteNome = (index, nome) => {
    setAmbientes((prev) => prev.map((amb, i) => (i === index ? { ...amb, nome } : amb)));
  };

  const updateItem = (ambienteIndex, itemIndex, field, value) => {
    setAmbientes((prev) => prev.map((amb, ai) => {
      if (ai !== ambienteIndex) return amb;
      return {
        ...amb,
        itens: amb.itens.map((item, ii) => {
          if (ii !== itemIndex) return item;
          const updated = { ...item, [field]: value };
          if (field === 'quantidade') {
            const qty = Number(value) || 1;
            const enc = Number(updated.quantidade_encomenda) || 0;
            updated.quantidade = qty;
            updated.quantidade_estoque = Math.max(qty - enc, 0);
            updated.quantidade_encomenda = Math.min(enc, qty);
          }
          return updated;
        }),
      };
    }));
  };

  const updateItemAtendimento = (ambienteIndex, itemIndex, field, value) => {
    setAmbientes((prev) => prev.map((amb, ai) => {
      if (ai !== ambienteIndex) return amb;
      return {
        ...amb,
        itens: amb.itens.map((item, ii) => {
          if (ii !== itemIndex) return item;
          const qty = Number(item.quantidade) || 1;
          let estoque = Number(item.quantidade_estoque) || 0;
          let encomenda = Number(item.quantidade_encomenda) || 0;
          if (field === 'quantidade_estoque') {
            estoque = Math.min(Math.max(Number(value) || 0, 0), qty);
            encomenda = qty - estoque;
          } else {
            encomenda = Math.min(Math.max(Number(value) || 0, 0), qty);
            estoque = qty - encomenda;
          }
          return { ...item, quantidade_estoque: estoque, quantidade_encomenda: encomenda };
        }),
      };
    }));
  };

  const setAtendimentoTipo = (ambienteIndex, itemIndex, tipo) => {
    setAmbientes((prev) => prev.map((amb, ai) => {
      if (ai !== ambienteIndex) return amb;
      return {
        ...amb,
        itens: amb.itens.map((item, ii) => {
          if (ii !== itemIndex) return item;
          const qty = Number(item.quantidade) || 1;
          if (tipo === 'estoque') {
            return { ...item, quantidade_estoque: qty, quantidade_encomenda: 0 };
          }
          if (tipo === 'encomenda') {
            return { ...item, quantidade_estoque: 0, quantidade_encomenda: qty };
          }
          return item;
        }),
      };
    }));
  };

  const removeItem = (ambienteIndex, itemIndex) => {
    setAmbientes((prev) => prev.map((amb, ai) => {
      if (ai !== ambienteIndex) return amb;
      return { ...amb, itens: amb.itens.filter((_, ii) => ii !== itemIndex) };
    }));
  };

  const addItemAvulso = (ambienteIndex) => {
    setAmbientes((prev) => prev.map((amb, i) => (
      i === ambienteIndex ? { ...amb, itens: [...amb.itens, emptyItem()] } : amb
    )));
  };

  const addProdutoAoAmbiente = (ambienteIndex, produto) => {
    setAmbientes((prev) => prev.map((amb, i) => (
      i === ambienteIndex ? {
        ...amb,
        itens: [...amb.itens, {
          produto_id: produto.id,
          descricao: produto.nome,
          quantidade: 1,
          quantidade_estoque: 1,
          quantidade_encomenda: 0,
          preco_unitario: Number(produto.preco_venda) || 0,
        }],
      } : amb
    )));
    setError('');
  };

  const addAmbiente = () => {
    setAmbientes((prev) => [...prev, emptyAmbiente()]);
  };

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
        return { ...p, [field]: Number(value) || 0 };
      }
      return { ...p, [field]: value };
    }));
  };

  const addPagamento = () => {
    setPagamentos((prev) => [...prev, criarPagamento(formasCadastro[0]?.id)]);
  };

  const removePagamento = (index) => {
    if (pagamentos.length <= 1) {
      setError('O pedido precisa ter pelo menos uma forma de pagamento.');
      return;
    }
    setPagamentos((prev) => prev.filter((_, i) => i !== index));
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

  const openProdutoPicker = (ambienteIndex) => {
    setProdutoModalAmbienteIndex(ambienteIndex);
    setShowSelecionarProduto(true);
  };

  const handleSaveProduto = async (data) => {
    const produto = await api.createProduto(data);
    const ambienteIndex = produtoModalAmbienteIndex;
    setAmbientes((prev) => prev.map((amb, i) => (
      i === ambienteIndex ? {
        ...amb,
        itens: [...amb.itens, {
          produto_id: produto.id,
          descricao: produto.nome,
          quantidade: 1,
          quantidade_estoque: 1,
          quantidade_encomenda: 0,
          preco_unitario: Number(produto.preco_venda) || 0,
        }],
      } : amb
    )));
    setShowProdutoModal(false);
    showSuccess(`Produto ${produto.sku} cadastrado e adicionado ao ambiente.`);
  };

  const openProdutoModal = (ambienteIndex) => {
    setProdutoModalAmbienteIndex(ambienteIndex);
    setShowSelecionarProduto(false);
    setShowProdutoModal(true);
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
    orcamento_id: orcamentoId ? Number(orcamentoId) : null,
    numero_pedido: numeroPedido,
    observacoes,
    entrega_tipo_liberacao: entregaTipoLiberacao,
    pagamentos,
    ambientes: ambientes.map((ambiente) => ({
      nome: ambiente.nome.trim() || AMBIENTE_NOME_PADRAO,
      itens: ambiente.itens
        .filter((item) => item.descricao.trim())
        .map((item) => ({
          produto_id: item.produto_id || null,
          descricao: item.descricao.trim(),
          quantidade: Number(item.quantidade) || 1,
          quantidade_estoque: Number(item.quantidade_estoque) || 0,
          quantidade_encomenda: Number(item.quantidade_encomenda) || 0,
          preco_unitario: Number(item.preco_unitario) || 0,
          status: item.status || 'efetivo',
          ...(item.preco_unitario_lista != null
            ? { preco_unitario_lista: Number(item.preco_unitario_lista) || 0 }
            : {}),
        })),
    })),
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
      const saved = await api.saveVenda(buildPayload(), null);
      hydrateFromVenda(saved);
      setBaselineSnapshot(snapshotFromVenda(saved));
      isDirtyRef.current = false;
      showSuccess('Venda registrada com sucesso!');
      if (!stayOnPage) {
        skipLoadRef.current = true;
        navigate(listPath);
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
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

  const gerarPdfInternal = async () => {
    setGeneratingPdf(true);
    setError('');
    try {
      await runWithFeedback(
        async () => {
          const result = await api.gerarPdfVenda(Number(id));
          if (result.cancelled) return result;
          return result;
        },
        {
          loading: 'Gerando PDF do pedido de venda...',
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
      setError('Salve a venda antes de gerar o PDF.');
      return;
    }
    if (isDirty) {
      setExitPrompt({ type: 'pdf' });
      return;
    }
    gerarPdfInternal();
  };

  if (loading) return <div className="loading">Carregando venda...</div>;

  if (setupStep === 'choose') {
    return (
      <>
        <header className="page-header">
          <h2>Nova venda</h2>
          <p>Escolha como deseja iniciar o pedido de venda</p>
        </header>

        {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

        <div className="venda-setup-grid">
          <button type="button" className="card venda-setup-card" onClick={() => setShowSelecionarOrcamento(true)}>
            <div className="venda-setup-icon">📋</div>
            <h3>Importar de orçamento</h3>
            <p>Carregue cliente, itens e formas de pagamento de um orçamento existente para editar e confirmar a venda.</p>
          </button>
          <button type="button" className="card venda-setup-card" onClick={startBlank}>
            <div className="venda-setup-icon">✏️</div>
            <h3>Cadastrar nova venda</h3>
            <p>Inicie um pedido em branco e preencha cliente, itens e condições de pagamento manualmente.</p>
          </button>
        </div>

        <div className="form-actions page-footer-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(listPath)}
          >
            Voltar
          </button>
        </div>

        {showSelecionarOrcamento && (
          <SelecionarOrcamentoModal
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
        <h2>{isNew ? 'Nova venda' : `Venda ${numero}`}</h2>
        <p>
          {numeroPedido ? `Pedido nº ${numeroPedido}` : 'Informe o número do pedido (5 dígitos)'}
          {orcamentoNumero && ` · Importada do orçamento ${orcamentoNumero}`}
          {!orcamentoNumero && !numeroPedido && ' — registre o pedido com itens e pagamento'}
        </p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="card">
        <div className="card-header">Dados da venda</div>
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
              <label htmlFor="numero_pedido">Número do pedido *</label>
              <input
                id="numero_pedido"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                placeholder="00000"
                value={numeroPedido}
                onChange={(e) => setNumeroPedido(e.target.value.replace(/\D/g, '').slice(0, 5))}
                required
                style={{ maxWidth: 140, letterSpacing: '0.08em' }}
              />
              <span className="hint-text">5 dígitos, único no sistema</span>
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
            {orcamentoNumero && (
              <div className="form-group">
                <label>Orçamento de origem</label>
                <input value={orcamentoNumero} readOnly className="input-readonly" />
              </div>
            )}
            <div className="form-group full-width">
              <label htmlFor="observacoes">Observações</label>
              <textarea id="observacoes" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label htmlFor="entrega_tipo">Entrega do pedido *</label>
              <select
                id="entrega_tipo"
                value={entregaTipoLiberacao}
                onChange={(e) => setEntregaTipoLiberacao(e.target.value)}
              >
                {TIPO_LIBERACAO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <span className="hint-text">
                Toda venda gera ao menos uma entrega. Escolha se libera por disponibilidade ou aguarda todos os produtos.
              </span>
            </div>
          </div>
        </div>
      </div>

      <section className="ambientes-section">
        <header className="ambientes-section-header">
          <h3>Ambientes</h3>
          <p>
            Em cada item, defina quantas unidades saem do estoque físico e quantas serão encomendadas ao fornecedor.
            Ao confirmar a venda, o estoque é reservado e as encomendas são geradas automaticamente.
          </p>
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
              <div className="toolbar ambiente-toolbar">
                <button type="button" className="btn btn-primary btn-add-item" onClick={() => openProdutoPicker(ambienteIndex)}>
                  + Adicionar produto
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => addItemAvulso(ambienteIndex)}>
                  + Item avulso
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => openProdutoModal(ambienteIndex)}>
                  + Cadastrar novo produto
                </button>
              </div>

              {ambiente.itens.length === 0 ? (
                <div className="empty-state ambiente-empty">
                  Nenhum item neste ambiente. Clique em &quot;Adicionar produto&quot; ou &quot;Item avulso&quot;.
                </div>
              ) : (
                <table>
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Descrição</th>
                    <th>Qtd</th>
                    <th>Atendimento</th>
                    <th>Estoque</th>
                    <th>Encomenda</th>
                    <th>Preço unit.</th>
                    <th>Comercial</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ambiente.itens.map((item, itemIndex) => {
                    const atendimento = (item.quantidade_encomenda || 0) === 0
                      ? 'estoque'
                      : (item.quantidade_estoque || 0) === 0 ? 'encomenda' : 'misto';
                    return (
                    <tr key={itemIndex}>
                        <td>
                          {item.produto_id ? (
                            <ProdutoThumb produtoId={item.produto_id} alt={item.descricao} />
                          ) : (
                            <div className="produto-thumb">
                              <div className="produto-thumb-placeholder" />
                            </div>
                          )}
                        </td>
                        <td>
                          <input
                            value={item.descricao}
                            onChange={(e) => updateItem(ambienteIndex, itemIndex, 'descricao', e.target.value)}
                            placeholder="Descrição do item"
                            style={{ width: '100%' }}
                          />
                        </td>
                      <td>
                        <NumericInput
                          min="1"
                          defaultOnEmpty={1}
                          value={item.quantidade}
                          onChange={(value) => updateItem(ambienteIndex, itemIndex, 'quantidade', value)}
                          style={{ width: 70 }}
                        />
                      </td>
                      <td>
                        <select
                          value={atendimento}
                          onChange={(e) => setAtendimentoTipo(ambienteIndex, itemIndex, e.target.value)}
                          style={{ minWidth: 110 }}
                        >
                          <option value="estoque">Estoque</option>
                          <option value="encomenda">Encomenda</option>
                          {atendimento === 'misto' && <option value="misto">Misto</option>}
                        </select>
                      </td>
                      <td>
                        <NumericInput
                          min="0"
                          max={item.quantidade}
                          value={item.quantidade_estoque ?? 0}
                          onChange={(value) => updateItemAtendimento(ambienteIndex, itemIndex, 'quantidade_estoque', value)}
                          style={{ width: 70 }}
                          title="Unidades atendidas do estoque físico"
                        />
                      </td>
                      <td>
                        <NumericInput
                          min="0"
                          max={item.quantidade}
                          value={item.quantidade_encomenda ?? 0}
                          onChange={(value) => updateItemAtendimento(ambienteIndex, itemIndex, 'quantidade_encomenda', value)}
                          style={{ width: 70 }}
                          title="Unidades a encomendar ao fornecedor"
                        />
                      </td>
                        <td>
                          <NumericInput
                            step="0.01"
                            min="0"
                            value={item.preco_unitario}
                            onChange={(value) => updateItem(ambienteIndex, itemIndex, 'preco_unitario', value)}
                            style={{ width: 120 }}
                          />
                        </td>
                        <td>
                          <select
                            value={item.status || 'efetivo'}
                            onChange={(e) => updateItem(ambienteIndex, itemIndex, 'status', e.target.value)}
                          >
                            {STATUS_ITEM_VENDA_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {(item.status || 'efetivo') === 'efetivo'
                            ? formatCurrency((Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0))
                            : '—'}
                        </td>
                        <td>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(ambienteIndex, itemIndex)}>
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              )}
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
            Combine várias formas de pagamento (dinheiro, PIX, cartão etc.). Se o valor acordado
            for diferente do subtotal dos produtos, os preços unitários serão ajustados
            proporcionalmente ao salvar — inclusive para corrigir um valor de pagamento informado
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
        <div className="card-body">
          <div className="totals-box">
            <div className="total-line"><span>Subtotal dos produtos:</span> <strong>{formatCurrency(subtotal)}</strong></div>
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
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => requestExit({ type: 'navigate', to: listPath })}
        >
          Voltar
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar venda'}
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
          context="venda"
          onClose={() => { setShowClienteModal(false); setClienteModalCliente(null); }}
          onSave={handleSaveCliente}
        />
      )}

      {showSelecionarProduto && (
        <SelecionarProdutoModal
          closeOnSelect
          onClose={() => setShowSelecionarProduto(false)}
          onSelect={(produto) => addProdutoAoAmbiente(produtoModalAmbienteIndex, produto)}
          onNovoProduto={() => openProdutoModal(produtoModalAmbienteIndex)}
        />
      )}

      {showProdutoModal && (
        <ProdutoModal
          categorias={categorias}
          fornecedores={fornecedores}
          onClose={() => setShowProdutoModal(false)}
          onSave={handleSaveProduto}
        />
      )}

      {exitPrompt && (
        <ConfirmarSaidaModal
          documentLabel="pedido de venda"
          variant={exitPrompt.type === 'pdf' ? 'pdf' : 'exit'}
          saving={saving || generatingPdf}
          onSalvar={handleConfirmSave}
          onDescartar={handleConfirmDiscard}
          onCancelar={() => setExitPrompt(null)}
        />
      )}
    </>
  );
}
