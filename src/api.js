/**
 * Cliente da API — Electron (window.api) ou Web (POST /api/invoke).
 */
let sessionToken = null;

export function setSessionToken(token) {
  sessionToken = token || null;
  if (token) localStorage.setItem('syscedro_session_token', token);
  else localStorage.removeItem('syscedro_session_token');
}

export function loadStoredSessionToken() {
  if (sessionToken) return sessionToken;
  try {
    sessionToken = localStorage.getItem('syscedro_session_token');
  } catch {
    sessionToken = null;
  }
  return sessionToken;
}

function isElectron() {
  return typeof window !== 'undefined' && typeof window.api?.login === 'function';
}

function apiBase() {
  const base = import.meta.env.VITE_API_BASE;
  if (base != null && String(base).length) return String(base).replace(/\/$/, '');
  return '';
}

function downloadPdf(data) {
  if (!data || data.cancelled) return data;
  if (data.pdfBase64) {
    const fileName = data.fileName || 'documento.pdf';
    const bin = atob(data.pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: data.mimeType || 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { cancelled: false, downloaded: true, fileName };
  }
  return data;
}

async function invokeElectron(method, args) {
  const fn = window.api?.[method];
  if (typeof fn !== 'function') {
    throw new Error(`API Electron indisponível (${method}). Reinicie o aplicativo.`);
  }
  const result = await fn(...args);
  if (result && typeof result === 'object' && 'success' in result) {
    if (!result.success) throw new Error(result.error || 'Erro desconhecido');
    return result.data;
  }
  return result;
}

async function invokeWeb(method, args) {
  loadStoredSessionToken();
  const res = await fetch(`${apiBase()}/api/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({ method, args }),
  });
  let result;
  try {
    result = await res.json();
  } catch {
    throw new Error(`Falha na API (${res.status}). Verifique se o backend está no ar.`);
  }
  if (!result.success) {
    throw new Error(result.error || 'Erro desconhecido');
  }
  const data = result.data;
  if (data?.token && (method === 'login' || method === 'restoreSession')) {
    setSessionToken(data.token);
  }
  if (method === 'logout') setSessionToken(null);
  return data;
}

async function invoke(method, args = []) {
  if (isElectron()) return invokeElectron(method, args);
  return invokeWeb(method, args);
}

/** Compat: callApi(fn, ...args) ainda usado? Preferir api.* */
export async function callApi(fn, ...args) {
  if (typeof fn === 'function') {
    const result = await fn(...args);
    if (result && typeof result === 'object' && 'success' in result) {
      if (!result.success) throw new Error(result.error || 'Erro desconhecido');
      return result.data;
    }
    return result;
  }
  throw new Error('API indisponível.');
}

export const api = {
  abrirAnexoVendaPlanejado: (...args) => invoke('abrirAnexoVendaPlanejado', args),
  adicionarAcompanhamentoPedidoAnotacao: (...args) => invoke('adicionarAcompanhamentoPedidoAnotacao', args),
  agendarExpedicao: (...args) => invoke('agendarExpedicao', args),
  alocarProduto: (...args) => invoke('alocarProduto', args),
  aplicarPadroesCustosFixosExercicio: (...args) => invoke('aplicarPadroesCustosFixosExercicio', args),
  aplicarPadroesCustosFixosMes: (...args) => invoke('aplicarPadroesCustosFixosMes', args),
  atualizarAcompanhamentoPedidoAnotacao: (...args) => invoke('atualizarAcompanhamentoPedidoAnotacao', args),
  backfillExpedicoesImplantacao: (...args) => invoke('backfillExpedicoesImplantacao', args),
  buscarVendasParaNovoIncentivo: (...args) => invoke('buscarVendasParaNovoIncentivo', args),
  confirmarAgendamentoCliente: (...args) => invoke('confirmarAgendamentoCliente', args),
  createCentroCusto: (...args) => invoke('createCentroCusto', args),
  createCliente: (...args) => invoke('createCliente', args),
  createColaborador: (...args) => invoke('createColaborador', args),
  createCustoFixoExtra: (...args) => invoke('createCustoFixoExtra', args),
  createCustoFixoTemplate: (...args) => invoke('createCustoFixoTemplate', args),
  createFormaPagamento: (...args) => invoke('createFormaPagamento', args),
  createFornecedor: (...args) => invoke('createFornecedor', args),
  createLocalizacao: (...args) => invoke('createLocalizacao', args),
  createMovimentacao: (...args) => invoke('createMovimentacao', args),
  createNotaFiscal: (...args) => invoke('createNotaFiscal', args),
  createPagamentoFinanceiro: (...args) => invoke('createPagamentoFinanceiro', args),
  createParceiro: (...args) => invoke('createParceiro', args),
  createProduto: (...args) => invoke('createProduto', args),
  createProdutoPlanejado: (...args) => invoke('createProdutoPlanejado', args),
  createUsuario: (...args) => invoke('createUsuario', args),
  createVendedor: (...args) => invoke('createVendedor', args),
  criarAssistenciaEntrega: (...args) => invoke('criarAssistenciaEntrega', args),
  criarAssistenciaTecnicaPlanejada: (...args) => invoke('criarAssistenciaTecnicaPlanejada', args),
  deleteCentroCusto: (...args) => invoke('deleteCentroCusto', args),
  deleteColaborador: (...args) => invoke('deleteColaborador', args),
  deleteCustoFixoMensal: (...args) => invoke('deleteCustoFixoMensal', args),
  deleteCustoFixoTemplate: (...args) => invoke('deleteCustoFixoTemplate', args),
  deleteEncomendaFornecedor: (...args) => invoke('deleteEncomendaFornecedor', args),
  deleteFormaPagamento: (...args) => invoke('deleteFormaPagamento', args),
  deleteFornecedor: (...args) => invoke('deleteFornecedor', args),
  deleteIncentivoParceiro: (...args) => invoke('deleteIncentivoParceiro', args),
  deleteLocalizacao: (...args) => invoke('deleteLocalizacao', args),
  deleteOrcamento: (...args) => invoke('deleteOrcamento', args),
  deleteOrcamentoPlanejado: (...args) => invoke('deleteOrcamentoPlanejado', args),
  deletePagamentoFinanceiro: (...args) => invoke('deletePagamentoFinanceiro', args),
  deleteParceiro: (...args) => invoke('deleteParceiro', args),
  deleteProduto: (...args) => invoke('deleteProduto', args),
  deleteProdutoPlanejado: (...args) => invoke('deleteProdutoPlanejado', args),
  deleteUsuario: (...args) => invoke('deleteUsuario', args),
  deleteVenda: (...args) => invoke('deleteVenda', args),
  deleteVendaPlanejado: (...args) => invoke('deleteVendaPlanejado', args),
  deleteVendedor: (...args) => invoke('deleteVendedor', args),
  editarVenda: (...args) => invoke('editarVenda', args),
  estornarRecebimento: (...args) => invoke('estornarRecebimento', args),
  excluirAcompanhamentoPedidoAnotacao: (...args) => invoke('excluirAcompanhamentoPedidoAnotacao', args),
  excluirPagamentoComissao: (...args) => invoke('excluirPagamentoComissao', args),
  excluirPagamentoComissaoPlanejado: (...args) => invoke('excluirPagamentoComissaoPlanejado', args),
  gerarPdfAlteracaoVenda: async (id) => downloadPdf(await invoke('gerarPdfAlteracaoVenda', [id])),
  gerarPdfEncomendaFornecedor: async (id) => downloadPdf(await invoke('gerarPdfEncomendaFornecedor', [id])),
  gerarPdfEntrega: async (id) => downloadPdf(await invoke('gerarPdfEntrega', [id])),
  gerarPdfEtiquetaProduto: async (data) => downloadPdf(await invoke('gerarPdfEtiquetaProduto', [data])),
  gerarPdfFolhasEtiquetas: async (data) => downloadPdf(await invoke('gerarPdfFolhasEtiquetas', [data])),
  gerarPdfOrcamento: async (id) => downloadPdf(await invoke('gerarPdfOrcamento', [id])),
  gerarPdfOrcamentoPlanejado: async (id) => downloadPdf(await invoke('gerarPdfOrcamentoPlanejado', [id])),
  gerarPdfVenda: async (id) => downloadPdf(await invoke('gerarPdfVenda', [id])),
  gerarPdfVendaPlanejado: async (id) => downloadPdf(await invoke('gerarPdfVendaPlanejado', [id])),
  getArquivoRegistro: (...args) => invoke('getArquivoRegistro', args),
  getCentroCusto: (...args) => invoke('getCentroCusto', args),
  getCliente: (...args) => invoke('getCliente', args),
  getColaborador: (...args) => invoke('getColaborador', args),
  getComissaoRegra: (...args) => invoke('getComissaoRegra', args),
  getComissaoRegraPlanejados: (...args) => invoke('getComissaoRegraPlanejados', args),
  getControleMensalComissoes: (...args) => invoke('getControleMensalComissoes', args),
  getControleMensalPlanejados: (...args) => invoke('getControleMensalPlanejados', args),
  getDashboard: (...args) => invoke('getDashboard', args),
  getDisponibilidadeProduto: (...args) => invoke('getDisponibilidadeProduto', args),
  getEncomendaFornecedor: (...args) => invoke('getEncomendaFornecedor', args),
  getEntrega: (...args) => invoke('getEntrega', args),
  getExercicioCustosFixos: (...args) => invoke('getExercicioCustosFixos', args),
  getFaseImplantacao: (...args) => invoke('getFaseImplantacao', args),
  getFormaPagamento: (...args) => invoke('getFormaPagamento', args),
  getFornecedor: (...args) => invoke('getFornecedor', args),
  getIncentivoParceiro: (...args) => invoke('getIncentivoParceiro', args),
  getMesCustosFixos: (...args) => invoke('getMesCustosFixos', args),
  getNotaFiscal: (...args) => invoke('getNotaFiscal', args),
  getOrcamento: (...args) => invoke('getOrcamento', args),
  getOrcamentoPlanejado: (...args) => invoke('getOrcamentoPlanejado', args),
  getPagamentoFinanceiro: (...args) => invoke('getPagamentoFinanceiro', args),
  getParceiro: (...args) => invoke('getParceiro', args),
  getProduto: (...args) => invoke('getProduto', args),
  getProdutoFoto: (...args) => invoke('getProdutoFoto', args),
  getProdutoPlanejado: (...args) => invoke('getProdutoPlanejado', args),
  getResumoPendenciasEncomenda: (...args) => invoke('getResumoPendenciasEncomenda', args),
  getSession: (...args) => invoke('getSession', args),
  getSyncStatus: () => invoke('getSyncStatus', []),
  getUsuario: (...args) => invoke('getUsuario', args),
  getVenda: (...args) => invoke('getVenda', args),
  getVendaAnaliseMarkup: (...args) => invoke('getVendaAnaliseMarkup', args),
  getVendaPlanejado: (...args) => invoke('getVendaPlanejado', args),
  getVendedor: (...args) => invoke('getVendedor', args),
  getVisaoGeralVendas: (...args) => invoke('getVisaoGeralVendas', args),
  listAcompanhamentoPedidoAnotacoes: (...args) => invoke('listAcompanhamentoPedidoAnotacoes', args),
  listAcompanhamentoPedidosPlanejados: (...args) => invoke('listAcompanhamentoPedidosPlanejados', args),
  listAjustesComissao: (...args) => invoke('listAjustesComissao', args),
  listAjustesComissaoMes: (...args) => invoke('listAjustesComissaoMes', args),
  listAlteracoesVenda: (...args) => invoke('listAlteracoesVenda', args),
  listArquivoRegistros: (...args) => invoke('listArquivoRegistros', args),
  listCategorias: (...args) => invoke('listCategorias', args),
  listCentrosCusto: (...args) => invoke('listCentrosCusto', args),
  listClientes: (...args) => invoke('listClientes', args),
  listClientesMarketingOrcamento: (...args) => invoke('listClientesMarketingOrcamento', args),
  listColaboradores: (...args) => invoke('listColaboradores', args),
  listComissaoRegras: (...args) => invoke('listComissaoRegras', args),
  listControleComissoes: (...args) => invoke('listControleComissoes', args),
  listCustosFixosTemplate: (...args) => invoke('listCustosFixosTemplate', args),
  listEncomendasFornecedor: (...args) => invoke('listEncomendasFornecedor', args),
  listEntregas: (...args) => invoke('listEntregas', args),
  listEntregasAgendadas: (...args) => invoke('listEntregasAgendadas', args),
  listEstoque: (...args) => invoke('listEstoque', args),
  listReservasProduto: (...args) => invoke('listReservasProduto', args),
  listEstoqueLocalizacoesProduto: (...args) => invoke('listEstoqueLocalizacoesProduto', args),
  listFormasPagamento: (...args) => invoke('listFormasPagamento', args),
  listFormasPagamentoAll: (...args) => invoke('listFormasPagamentoAll', args),
  listFornecedores: (...args) => invoke('listFornecedores', args),
  listHistoricoRecebimentos: (...args) => invoke('listHistoricoRecebimentos', args),
  listIncentivosParceiro: (...args) => invoke('listIncentivosParceiro', args),
  listItensControleRecebimento: (...args) => invoke('listItensControleRecebimento', args),
  listItensPendentesRecebimento: (...args) => invoke('listItensPendentesRecebimento', args),
  listLocalizacoes: (...args) => invoke('listLocalizacoes', args),
  listMovimentacoes: (...args) => invoke('listMovimentacoes', args),
  listNotasFiscais: (...args) => invoke('listNotasFiscais', args),
  listOrcamentos: (...args) => invoke('listOrcamentos', args),
  listOrcamentosPlanejados: (...args) => invoke('listOrcamentosPlanejados', args),
  listPagamentosFinanceiros: (...args) => invoke('listPagamentosFinanceiros', args),
  listParceiros: (...args) => invoke('listParceiros', args),
  listPendenciasAlocacao: (...args) => invoke('listPendenciasAlocacao', args),
  listPendenciasEncomenda: (...args) => invoke('listPendenciasEncomenda', args),
  listProdutos: (...args) => invoke('listProdutos', args),
  listProdutosPlanejados: (...args) => invoke('listProdutosPlanejados', args),
  listProdutosPlanejadosAll: (...args) => invoke('listProdutosPlanejadosAll', args),
  listRecebimentosParaEtiquetas: (...args) => invoke('listRecebimentosParaEtiquetas', args),
  listUsuarios: (...args) => invoke('listUsuarios', args),
  listUsuariosParaColaborador: (...args) => invoke('listUsuariosParaColaborador', args),
  listVendas: (...args) => invoke('listVendas', args),
  listVendasDesativadas: (...args) => invoke('listVendasDesativadas', args),
  listVendasPlanejados: (...args) => invoke('listVendasPlanejados', args),
  listVendedores: (...args) => invoke('listVendedores', args),
  login: (login, senha) => invoke('login', [{ login, senha }]),
  logout: (...args) => invoke('logout', args),
  marcarEntregaJaRealizada: (...args) => invoke('marcarEntregaJaRealizada', args),
  moverAcompanhamentoPedidoKanban: (...args) => invoke('moverAcompanhamentoPedidoKanban', args),
  moverOrcamentoKanban: (...args) => invoke('moverOrcamentoKanban', args),
  moverOrcamentoPlanejadoKanban: (...args) => invoke('moverOrcamentoPlanejadoKanban', args),
  openExternalUrl: (...args) => invoke('openExternalUrl', args),
  receberEncomendaItem: (...args) => invoke('receberEncomendaItem', args),
  registrarEntrega: (...args) => invoke('registrarEntrega', args),
  restaurarArquivoRegistro: (...args) => invoke('restaurarArquivoRegistro', args),
  restaurarVenda: (...args) => invoke('restaurarVenda', args),
  restoreSession: (userId) => invoke('restoreSession', [userId]),
  salvarPagamentoComissao: (...args) => invoke('salvarPagamentoComissao', args),
  salvarPagamentoComissaoPlanejado: (...args) => invoke('salvarPagamentoComissaoPlanejado', args),
  saveComissaoRegra: (...args) => invoke('saveComissaoRegra', args),
  saveComissaoRegraPlanejados: (...args) => invoke('saveComissaoRegraPlanejados', args),
  saveEncomendaFornecedor: (...args) => invoke('saveEncomendaFornecedor', args),
  saveIncentivoParceiro: (...args) => invoke('saveIncentivoParceiro', args),
  saveOrcamento: (...args) => invoke('saveOrcamento', args),
  saveOrcamentoPlanejado: (...args) => invoke('saveOrcamentoPlanejado', args),
  saveVenda: (...args) => invoke('saveVenda', args),
  saveVendaPlanejado: (...args) => invoke('saveVendaPlanejado', args),
  setFaseImplantacao: (...args) => invoke('setFaseImplantacao', args),
  sincronizarComissoes: (...args) => invoke('sincronizarComissoes', args),
  sincronizarComissoesPlanejados: (...args) => invoke('sincronizarComissoesPlanejados', args),
  updateCentroCusto: (...args) => invoke('updateCentroCusto', args),
  updateCliente: (...args) => invoke('updateCliente', args),
  updateColaborador: (...args) => invoke('updateColaborador', args),
  updateCustoFixoMensal: (...args) => invoke('updateCustoFixoMensal', args),
  updateCustoFixoTemplate: (...args) => invoke('updateCustoFixoTemplate', args),
  updateEncomendaFornecedorStatus: (...args) => invoke('updateEncomendaFornecedorStatus', args),
  updateEntrega: (...args) => invoke('updateEntrega', args),
  updateEntregaKanban: (...args) => invoke('updateEntregaKanban', args),
  updateFormaPagamento: (...args) => invoke('updateFormaPagamento', args),
  updateFornecedor: (...args) => invoke('updateFornecedor', args),
  updateLocalizacao: (...args) => invoke('updateLocalizacao', args),
  updateOrcamentoStatus: (...args) => invoke('updateOrcamentoStatus', args),
  updatePagamentoFinanceiro: (...args) => invoke('updatePagamentoFinanceiro', args),
  updateParceiro: (...args) => invoke('updateParceiro', args),
  updateProduto: (...args) => invoke('updateProduto', args),
  updateProdutoPlanejado: (...args) => invoke('updateProdutoPlanejado', args),
  updateUsuario: (...args) => invoke('updateUsuario', args),
  updateVendedor: (...args) => invoke('updateVendedor', args),
  onAppCloseRequest: (handler) => { if (window.api?.onAppCloseRequest) window.api.onAppCloseRequest(handler); },
  confirmAppClose: () => { if (window.api?.confirmAppClose) window.api.confirmAppClose(); },
  onSyncCompleted: (handler) => { if (window.api?.onSyncCompleted) window.api.onSyncCompleted(handler); },
  onConnectivityChanged: (handler) => { if (window.api?.onConnectivityChanged) window.api.onConnectivityChanged(handler); },
};
