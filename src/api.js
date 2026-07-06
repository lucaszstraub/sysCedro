export async function callApi(fn, ...args) {
  if (typeof fn !== 'function') {
    throw new Error('API indisponível. Reinicie o aplicativo Electron (feche e abra novamente).');
  }
  const result = await fn(...args);
  if (!result.success) {
    throw new Error(result.error || 'Erro desconhecido');
  }
  return result.data;
}

export const api = {
  login: (login, senha) => callApi(window.api.login, { login, senha }),
  logout: () => callApi(window.api.logout),
  getSession: () => callApi(window.api.getSession),
  restoreSession: (userId) => callApi(window.api.restoreSession, userId),
  listUsuarios: (busca) => callApi(window.api.listUsuarios, busca),
  getUsuario: (id) => callApi(window.api.getUsuario, id),
  createUsuario: (data) => callApi(window.api.createUsuario, data),
  updateUsuario: (id, data) => callApi(window.api.updateUsuario, id, data),
  deleteUsuario: (id) => callApi(window.api.deleteUsuario, id),
  listColaboradores: (busca) => callApi(window.api.listColaboradores, busca),
  getColaborador: (id) => callApi(window.api.getColaborador, id),
  listUsuariosParaColaborador: (colaboradorId) => callApi(window.api.listUsuariosParaColaborador, colaboradorId),
  createColaborador: (data) => callApi(window.api.createColaborador, data),
  updateColaborador: (id, data) => callApi(window.api.updateColaborador, id, data),
  deleteColaborador: (id) => callApi(window.api.deleteColaborador, id),
  listCustosFixosTemplate: () => callApi(window.api.listCustosFixosTemplate),
  createCustoFixoTemplate: (data) => callApi(window.api.createCustoFixoTemplate, data),
  updateCustoFixoTemplate: (id, data) => callApi(window.api.updateCustoFixoTemplate, id, data),
  deleteCustoFixoTemplate: (id) => callApi(window.api.deleteCustoFixoTemplate, id),
  getExercicioCustosFixos: (ano) => callApi(window.api.getExercicioCustosFixos, ano),
  getMesCustosFixos: (ano, mes) => callApi(window.api.getMesCustosFixos, ano, mes),
  updateCustoFixoMensal: (id, data) => callApi(window.api.updateCustoFixoMensal, id, data),
  createCustoFixoExtra: (data) => callApi(window.api.createCustoFixoExtra, data),
  deleteCustoFixoMensal: (id) => callApi(window.api.deleteCustoFixoMensal, id),
  aplicarPadroesCustosFixosMes: (ano, mes) => callApi(window.api.aplicarPadroesCustosFixosMes, ano, mes),
  aplicarPadroesCustosFixosExercicio: (ano) => callApi(window.api.aplicarPadroesCustosFixosExercicio, ano),
  listCentrosCusto: (busca, opts) => callApi(window.api.listCentrosCusto, busca, opts),
  getCentroCusto: (id) => callApi(window.api.getCentroCusto, id),
  createCentroCusto: (data) => callApi(window.api.createCentroCusto, data),
  updateCentroCusto: (id, data) => callApi(window.api.updateCentroCusto, id, data),
  deleteCentroCusto: (id) => callApi(window.api.deleteCentroCusto, id),
  listPagamentosFinanceiros: (filtros) => callApi(window.api.listPagamentosFinanceiros, filtros),
  getPagamentoFinanceiro: (id) => callApi(window.api.getPagamentoFinanceiro, id),
  createPagamentoFinanceiro: (data) => callApi(window.api.createPagamentoFinanceiro, data),
  updatePagamentoFinanceiro: (id, data) => callApi(window.api.updatePagamentoFinanceiro, id, data),
  deletePagamentoFinanceiro: (id) => callApi(window.api.deletePagamentoFinanceiro, id),
  listNotasFiscais: (busca, fornecedorId) => callApi(window.api.listNotasFiscais, busca, fornecedorId),
  getNotaFiscal: (id) => callApi(window.api.getNotaFiscal, id),
  createNotaFiscal: (data) => callApi(window.api.createNotaFiscal, data),
  getDashboard: () => callApi(window.api.getDashboard),
  listCategorias: () => callApi(window.api.listCategorias),
  listFornecedores: (busca) => callApi(window.api.listFornecedores, busca),
  getFornecedor: (id) => callApi(window.api.getFornecedor, id),
  createFornecedor: (data) => callApi(window.api.createFornecedor, data),
  updateFornecedor: (id, data) => callApi(window.api.updateFornecedor, id, data),
  deleteFornecedor: (id) => callApi(window.api.deleteFornecedor, id),
  listParceiros: (busca) => callApi(window.api.listParceiros, busca),
  getParceiro: (id) => callApi(window.api.getParceiro, id),
  createParceiro: (data) => callApi(window.api.createParceiro, data),
  updateParceiro: (id, data) => callApi(window.api.updateParceiro, id, data),
  deleteParceiro: (id) => callApi(window.api.deleteParceiro, id),
  listIncentivosParceiro: (filtros) => callApi(window.api.listIncentivosParceiro, filtros),
  buscarVendasParaNovoIncentivo: (busca) => callApi(window.api.buscarVendasParaNovoIncentivo, busca),
  getIncentivoParceiro: (vendaId) => callApi(window.api.getIncentivoParceiro, vendaId),
  saveIncentivoParceiro: (data) => callApi(window.api.saveIncentivoParceiro, data),
  deleteIncentivoParceiro: (vendaId) => callApi(window.api.deleteIncentivoParceiro, vendaId),
  listFormasPagamento: (busca) => callApi(window.api.listFormasPagamento, busca),
  listFormasPagamentoAll: (busca) => callApi(window.api.listFormasPagamentoAll, busca),
  getFormaPagamento: (id) => callApi(window.api.getFormaPagamento, id),
  createFormaPagamento: (data) => callApi(window.api.createFormaPagamento, data),
  updateFormaPagamento: (id, data) => callApi(window.api.updateFormaPagamento, id, data),
  deleteFormaPagamento: (id) => callApi(window.api.deleteFormaPagamento, id),
  listProdutosPlanejados: (busca) => callApi(window.api.listProdutosPlanejados, busca),
  listProdutosPlanejadosAll: (busca) => callApi(window.api.listProdutosPlanejadosAll, busca),
  getProdutoPlanejado: (id) => callApi(window.api.getProdutoPlanejado, id),
  createProdutoPlanejado: (data) => callApi(window.api.createProdutoPlanejado, data),
  updateProdutoPlanejado: (id, data) => callApi(window.api.updateProdutoPlanejado, id, data),
  deleteProdutoPlanejado: (id) => callApi(window.api.deleteProdutoPlanejado, id),
  listLocalizacoes: () => callApi(window.api.listLocalizacoes),
  createLocalizacao: (data) => callApi(window.api.createLocalizacao, data),
  updateLocalizacao: (id, data) => callApi(window.api.updateLocalizacao, id, data),
  deleteLocalizacao: (id) => callApi(window.api.deleteLocalizacao, id),
  listProdutos: (busca) => callApi(window.api.listProdutos, busca),
  getProduto: (id) => callApi(window.api.getProduto, id),
  createProduto: (data) => callApi(window.api.createProduto, data),
  updateProduto: (id, data) => callApi(window.api.updateProduto, id, data),
  deleteProduto: (id) => callApi(window.api.deleteProduto, id),
  getProdutoFoto: (id) => callApi(window.api.getProdutoFoto, id),
  gerarPdfEtiquetaProduto: async (data) => {
    const result = await window.api.gerarPdfEtiquetaProduto(data);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar etiqueta');
    if (result.data?.cancelled) return { cancelled: true };
    return result.data;
  },
  listRecebimentosParaEtiquetas: (busca) => callApi(window.api.listRecebimentosParaEtiquetas, busca),
  gerarPdfFolhasEtiquetas: async (data) => {
    const result = await window.api.gerarPdfFolhasEtiquetas(data);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar folhas de etiquetas');
    if (result.data?.cancelled) return { cancelled: true };
    return result.data;
  },
  listEstoque: (busca) => callApi(window.api.listEstoque, busca),
  listPendenciasAlocacao: (busca) => callApi(window.api.listPendenciasAlocacao, busca),
  alocarProduto: (data) => callApi(window.api.alocarProduto, data),
  listMovimentacoes: (limite) => callApi(window.api.listMovimentacoes, limite),
  createMovimentacao: (data) => callApi(window.api.createMovimentacao, data),
  listClientes: (busca) => callApi(window.api.listClientes, busca),
  getCliente: (id) => callApi(window.api.getCliente, id),
  createCliente: (data) => callApi(window.api.createCliente, data),
  updateCliente: (id, data) => callApi(window.api.updateCliente, id, data),
  listOrcamentos: (busca) => callApi(window.api.listOrcamentos, busca),
  getOrcamento: (id) => callApi(window.api.getOrcamento, id),
  saveOrcamento: (data, id) => callApi(window.api.saveOrcamento, data, id),
  updateOrcamentoStatus: (id, status, motivo) => callApi(window.api.updateOrcamentoStatus, id, status, motivo),
  moverOrcamentoKanban: (id, data) => callApi(window.api.moverOrcamentoKanban, id, data),
  listClientesMarketingOrcamento: (motivo) => callApi(window.api.listClientesMarketingOrcamento, motivo),
  deleteOrcamento: (id) => callApi(window.api.deleteOrcamento, id),
  gerarPdfOrcamento: async (id) => {
    const result = await window.api.gerarPdfOrcamento(id);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar PDF');
    return result.data;
  },
  listOrcamentosPlanejados: (busca) => callApi(window.api.listOrcamentosPlanejados, busca),
  getOrcamentoPlanejado: (id) => callApi(window.api.getOrcamentoPlanejado, id),
  saveOrcamentoPlanejado: (data, id) => callApi(window.api.saveOrcamentoPlanejado, data, id),
  moverOrcamentoPlanejadoKanban: (id, data) => callApi(window.api.moverOrcamentoPlanejadoKanban, id, data),
  deleteOrcamentoPlanejado: (id) => callApi(window.api.deleteOrcamentoPlanejado, id),
  gerarPdfOrcamentoPlanejado: async (id) => {
    const result = await window.api.gerarPdfOrcamentoPlanejado(id);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar PDF');
    return result.data;
  },
  listVendasPlanejados: (busca) => callApi(window.api.listVendasPlanejados, busca),
  getVendaPlanejado: (id) => callApi(window.api.getVendaPlanejado, id),
  saveVendaPlanejado: (data, id) => callApi(window.api.saveVendaPlanejado, data, id),
  deleteVendaPlanejado: (id) => callApi(window.api.deleteVendaPlanejado, id),
  abrirAnexoVendaPlanejado: (vendaId, anexoId) => callApi(window.api.abrirAnexoVendaPlanejado, vendaId, anexoId),
  gerarPdfVendaPlanejado: async (id) => {
    const result = await window.api.gerarPdfVendaPlanejado(id);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar PDF');
    return result.data;
  },
  listAcompanhamentoPedidosPlanejados: (busca) => callApi(window.api.listAcompanhamentoPedidosPlanejados, busca),
  moverAcompanhamentoPedidoKanban: (id, data) => callApi(window.api.moverAcompanhamentoPedidoKanban, id, data),
  criarAssistenciaTecnicaPlanejada: (data) => callApi(window.api.criarAssistenciaTecnicaPlanejada, data),
  listAcompanhamentoPedidoAnotacoes: (id) => callApi(window.api.listAcompanhamentoPedidoAnotacoes, id),
  adicionarAcompanhamentoPedidoAnotacao: (id, texto) => callApi(window.api.adicionarAcompanhamentoPedidoAnotacao, id, texto),
  atualizarAcompanhamentoPedidoAnotacao: (id, texto) => callApi(window.api.atualizarAcompanhamentoPedidoAnotacao, id, texto),
  excluirAcompanhamentoPedidoAnotacao: (id) => callApi(window.api.excluirAcompanhamentoPedidoAnotacao, id),
  getVisaoGeralVendas: (filtros) => callApi(window.api.getVisaoGeralVendas, filtros),
  getVendaAnaliseMarkup: (id) => callApi(window.api.getVendaAnaliseMarkup, id),
  listAjustesComissao: (filtros) => callApi(window.api.listAjustesComissao, filtros),
  listVendas: (busca) => callApi(window.api.listVendas, busca),
  listVendasDesativadas: (busca) => callApi(window.api.listVendasDesativadas, busca),
  getVenda: (id) => callApi(window.api.getVenda, id),
  saveVenda: (data, id) => callApi(window.api.saveVenda, data, id),
  editarVenda: (id, data) => callApi(window.api.editarVenda, id, data),
  listAlteracoesVenda: (id) => callApi(window.api.listAlteracoesVenda, id),
  deleteVenda: (id) => callApi(window.api.deleteVenda, id),
  restaurarVenda: (id) => callApi(window.api.restaurarVenda, id),
  gerarPdfVenda: async (id) => {
    const result = await window.api.gerarPdfVenda(id);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar PDF');
    return result.data;
  },
  gerarPdfAlteracaoVenda: async (id) => {
    const result = await window.api.gerarPdfAlteracaoVenda(id);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar PDF');
    return result.data;
  },
  listEntregas: (filtro, busca) => callApi(window.api.listEntregas, filtro, busca),
  listEntregasAgendadas: (busca) => callApi(window.api.listEntregasAgendadas, busca),
  getEntrega: (id) => callApi(window.api.getEntrega, id),
  updateEntrega: (id, data) => callApi(window.api.updateEntrega, id, data),
  updateEntregaKanban: (id, data) => callApi(window.api.updateEntregaKanban, id, data),
  confirmarAgendamentoCliente: (id) => callApi(window.api.confirmarAgendamentoCliente, id),
  agendarExpedicao: (vendaId, data) => callApi(window.api.agendarExpedicao, vendaId, data),
  criarAssistenciaEntrega: (data) => callApi(window.api.criarAssistenciaEntrega, data),
  registrarEntrega: (id, data) => callApi(window.api.registrarEntrega, id, data),
  gerarPdfEntrega: async (id) => {
    const result = await window.api.gerarPdfEntrega(id);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar PDF');
    return result.data;
  },
  listEncomendasFornecedor: (busca) => callApi(window.api.listEncomendasFornecedor, busca),
  getEncomendaFornecedor: (id) => callApi(window.api.getEncomendaFornecedor, id),
  saveEncomendaFornecedor: (data, id) => callApi(window.api.saveEncomendaFornecedor, data, id),
  deleteEncomendaFornecedor: (id) => callApi(window.api.deleteEncomendaFornecedor, id),
  updateEncomendaFornecedorStatus: (id, status) => callApi(window.api.updateEncomendaFornecedorStatus, id, status),
  listPendenciasEncomenda: (fornecedorId, busca) => callApi(window.api.listPendenciasEncomenda, fornecedorId, busca),
  getResumoPendenciasEncomenda: () => callApi(window.api.getResumoPendenciasEncomenda),
  listItensPendentesRecebimento: (busca) => callApi(window.api.listItensPendentesRecebimento, busca),
  listItensControleRecebimento: (filtro, busca) => callApi(window.api.listItensControleRecebimento, filtro, busca),
  listHistoricoRecebimentos: (busca) => callApi(window.api.listHistoricoRecebimentos, busca),
  estornarRecebimento: (id) => callApi(window.api.estornarRecebimento, id),
  receberEncomendaItem: (data) => callApi(window.api.receberEncomendaItem, data),
  getDisponibilidadeProduto: (produtoId) => callApi(window.api.getDisponibilidadeProduto, produtoId),
  gerarPdfEncomendaFornecedor: async (id) => {
    const result = await window.api.gerarPdfEncomendaFornecedor(id);
    if (!result.success) throw new Error(result.error || 'Erro ao gerar PDF');
    return result.data;
  },
  listVendedores: (busca, classificacao) => callApi(window.api.listVendedores, busca, classificacao),
  getVendedor: (id) => callApi(window.api.getVendedor, id),
  createVendedor: (data) => callApi(window.api.createVendedor, data),
  updateVendedor: (id, data) => callApi(window.api.updateVendedor, id, data),
  deleteVendedor: (id) => callApi(window.api.deleteVendedor, id),
  listArquivoRegistros: (filtros) => callApi(window.api.listArquivoRegistros, filtros),
  getArquivoRegistro: (id) => callApi(window.api.getArquivoRegistro, id),
  restaurarArquivoRegistro: (id) => callApi(window.api.restaurarArquivoRegistro, id),
  listComissaoRegras: () => callApi(window.api.listComissaoRegras),
  getComissaoRegra: (perfil) => callApi(window.api.getComissaoRegra, perfil),
  saveComissaoRegra: (data) => callApi(window.api.saveComissaoRegra, data),
  listControleComissoes: (filtros) => callApi(window.api.listControleComissoes, filtros),
  sincronizarComissoes: () => callApi(window.api.sincronizarComissoes),
  getControleMensalComissoes: (filtros) => callApi(window.api.getControleMensalComissoes, filtros),
  listAjustesComissaoMes: (filtros) => callApi(window.api.listAjustesComissaoMes, filtros),
  salvarPagamentoComissao: (data) => callApi(window.api.salvarPagamentoComissao, data),
  excluirPagamentoComissao: (id) => callApi(window.api.excluirPagamentoComissao, id),
  getComissaoRegraPlanejados: () => callApi(window.api.getComissaoRegraPlanejados),
  saveComissaoRegraPlanejados: (data) => callApi(window.api.saveComissaoRegraPlanejados, data),
  getControleMensalPlanejados: (filtros) => callApi(window.api.getControleMensalPlanejados, filtros),
  sincronizarComissoesPlanejados: (ano) => callApi(window.api.sincronizarComissoesPlanejados, ano),
  salvarPagamentoComissaoPlanejado: (data) => callApi(window.api.salvarPagamentoComissaoPlanejado, data),
  excluirPagamentoComissaoPlanejado: (id) => callApi(window.api.excluirPagamentoComissaoPlanejado, id),
  onAppCloseRequest: (handler) => window.api.onAppCloseRequest(handler),
  confirmAppClose: () => window.api.confirmAppClose(),
};
