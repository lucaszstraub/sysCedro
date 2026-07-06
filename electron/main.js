const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { initDatabase } = require('./database');
const services = require('./services');
const clientes = require('./clientes');
const orcamentos = require('./orcamentos');
const orcamentosPlanejados = require('./orcamentosPlanejados');
const analiseVendas = require('./analiseVendas');
const vendas = require('./vendas');
const vendaEdicao = require('./vendaEdicao');
const vendasPlanejados = require('./vendasPlanejados');
const encomendas = require('./encomendas');
const entregas = require('./entregas');
const etiquetas = require('./etiquetas');
const vendedores = require('./vendedores');
const fornecedores = require('./fornecedores');
const parceiros = require('./parceiros');
const incentivosParceiro = require('./incentivosParceiro');
const formasPagamento = require('./formasPagamento');
const produtosPlanejados = require('./produtosPlanejados');
const acompanhamentoPedidosPlanejados = require('./acompanhamentoPedidosPlanejados');
const comissaoRegras = require('./comissaoRegras');
const comissaoVendas = require('./comissaoVendas');
const comissaoPagamentos = require('./comissaoPagamentos');
const comissaoRegrasPlanejados = require('./comissaoRegrasPlanejados');
const comissaoPlanejados = require('./comissaoPlanejados');
const auth = require('./auth');
const usuarios = require('./usuarios');
const colaboradores = require('./colaboradores');
const custosFixos = require('./custosFixos');
const pagamentosFinanceiros = require('./pagamentosFinanceiros');
const notasFiscais = require('./notasFiscais');
const arquivo = require('./arquivo');
const { gerarPdfOrcamento } = require('./pdf');
const { gerarPdfOrcamentoPlanejado } = require('./pdfOrcamentoPlanejado');
const { gerarPdfVendaPlanejado } = require('./pdfVendaPlanejado');
const { gerarPdfVenda } = require('./pdfVenda');
const { gerarPdfAlteracaoVenda } = require('./pdfAlteracaoVenda');
const { gerarPdfEncomendaFornecedor } = require('./pdfEncomendaFornecedor');
const { gerarPdfEntrega } = require('./pdfEntrega');
const { gerarPdfEtiquetaProduto, gerarPdfFolhasEtiquetas } = require('./pdfEtiquetaProduto');
const { salvarEAbrirPdf } = require('./pdfExport');
const { initImages } = require('./images');

const isDev = !app.isPackaged;

let mainWindow = null;
let allowClose = false;

function createWindow() {
  allowClose = false;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'SysCedro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    mainWindow.webContents.send('app:close-request');
  });
}

ipcMain.on('app:close-confirmed', () => {
  allowClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

function registerHandlers() {
  const handlers = {
    'auth:login': (_, data) => auth.login(data.login, data.senha),
    'auth:logout': () => auth.logout(),
    'auth:me': () => auth.getSession(),
    'auth:restore': (_, userId) => auth.restoreSession(userId),
    'usuarios:list': (_, busca) => usuarios.listUsuarios(busca),
    'usuarios:get': (_, id) => usuarios.getUsuario(id),
    'usuarios:create': (_, data) => usuarios.createUsuario(data),
    'usuarios:update': (_, id, data) => usuarios.updateUsuario(id, data),
    'usuarios:delete': (_, id) => usuarios.deleteUsuario(id),
    'colaboradores:list': (_, busca) => colaboradores.listColaboradores(busca),
    'colaboradores:get': (_, id) => colaboradores.getColaborador(id),
    'colaboradores:usuarios': (_, colaboradorId) => colaboradores.listUsuariosParaColaborador(colaboradorId),
    'colaboradores:create': (_, data) => colaboradores.createColaborador(data),
    'colaboradores:update': (_, id, data) => colaboradores.updateColaborador(id, data),
    'colaboradores:delete': (_, id) => colaboradores.deleteColaborador(id),
    'custosFixos:template:list': () => custosFixos.listCustosFixosTemplate(),
    'custosFixos:template:create': (_, data) => custosFixos.createCustoFixoTemplate(data),
    'custosFixos:template:update': (_, id, data) => custosFixos.updateCustoFixoTemplate(id, data),
    'custosFixos:template:delete': (_, id) => custosFixos.deleteCustoFixoTemplate(id),
    'custosFixos:exercicio': (_, ano) => custosFixos.getExercicioCustosFixos(ano),
    'custosFixos:mes': (_, ano, mes) => custosFixos.getMesCustosFixos(ano, mes),
    'custosFixos:mensal:update': (_, id, data) => custosFixos.updateCustoFixoMensal(id, data),
    'custosFixos:extra:create': (_, data) => custosFixos.createCustoFixoExtra(data),
    'custosFixos:mensal:delete': (_, id) => custosFixos.deleteCustoFixoMensal(id),
    'custosFixos:aplicarMes': (_, ano, mes) => custosFixos.aplicarPadroesMes(ano, mes),
    'custosFixos:aplicarExercicio': (_, ano) => custosFixos.aplicarPadroesExercicio(ano),

    'centrosCusto:list': (_, busca, opts) => pagamentosFinanceiros.listCentrosCusto(busca, opts),
    'centrosCusto:get': (_, id) => pagamentosFinanceiros.getCentroCusto(id),
    'centrosCusto:create': (_, data) => pagamentosFinanceiros.createCentroCusto(data),
    'centrosCusto:update': (_, id, data) => pagamentosFinanceiros.updateCentroCusto(id, data),
    'centrosCusto:delete': (_, id) => pagamentosFinanceiros.deleteCentroCusto(id),
    'pagamentosFinanceiros:list': (_, filtros) => pagamentosFinanceiros.listPagamentosFinanceiros(filtros),
    'pagamentosFinanceiros:get': (_, id) => pagamentosFinanceiros.getPagamentoFinanceiro(id),
    'pagamentosFinanceiros:create': (_, data) => pagamentosFinanceiros.createPagamentoFinanceiro(data),
    'pagamentosFinanceiros:update': (_, id, data) => pagamentosFinanceiros.updatePagamentoFinanceiro(id, data),
    'pagamentosFinanceiros:delete': (_, id) => pagamentosFinanceiros.deletePagamentoFinanceiro(id),

    'notasFiscais:list': (_, busca, fornecedorId) => notasFiscais.listNotasFiscais(busca, fornecedorId),
    'notasFiscais:get': (_, id) => notasFiscais.getNotaFiscal(id),
    'notasFiscais:create': (_, data) => notasFiscais.createNotaFiscal(data),
    'dashboard:get': () => services.getDashboard(),
    'categorias:list': () => services.listCategorias(),
    'fornecedores:list': (_, busca) => fornecedores.listFornecedores(busca),
    'fornecedores:get': (_, id) => fornecedores.getFornecedor(id),
    'fornecedores:create': (_, data) => fornecedores.createFornecedor(data),
    'fornecedores:update': (_, id, data) => fornecedores.updateFornecedor(id, data),
    'fornecedores:delete': (_, id) => fornecedores.deleteFornecedor(id),
    'parceiros:list': (_, busca) => parceiros.listParceiros(busca),
    'parceiros:get': (_, id) => parceiros.getParceiro(id),
    'parceiros:create': (_, data) => parceiros.createParceiro(data),
    'parceiros:update': (_, id, data) => parceiros.updateParceiro(id, data),
    'parceiros:delete': (_, id) => parceiros.deleteParceiro(id),
    'incentivosParceiro:list': (_, filtros) => incentivosParceiro.listIncentivosParceiro(filtros),
    'incentivosParceiro:buscarVendas': (_, busca) => incentivosParceiro.buscarVendasParaNovoIncentivo(busca),
    'incentivosParceiro:get': (_, vendaId) => incentivosParceiro.getIncentivoParceiro(vendaId),
    'incentivosParceiro:save': (_, data) => incentivosParceiro.salvarIncentivoParceiro(data),
    'incentivosParceiro:delete': (_, vendaId) => incentivosParceiro.removerIncentivoParceiro(vendaId),
    'formasPagamento:list': (_, busca) => formasPagamento.listFormasPagamento(busca),
    'formasPagamento:listAll': (_, busca) => formasPagamento.listFormasPagamentoTodas(busca),
    'formasPagamento:get': (_, id) => formasPagamento.getFormaPagamento(id),
    'formasPagamento:create': (_, data) => formasPagamento.createFormaPagamento(data),
    'formasPagamento:update': (_, id, data) => formasPagamento.updateFormaPagamento(id, data),
    'formasPagamento:delete': (_, id) => formasPagamento.deleteFormaPagamento(id),
    'produtosPlanejados:list': (_, busca) => produtosPlanejados.listProdutosPlanejados(busca, { apenasAtivos: true }),
    'produtosPlanejados:listAll': (_, busca) => produtosPlanejados.listProdutosPlanejados(busca, { apenasAtivos: false }),
    'produtosPlanejados:get': (_, id) => produtosPlanejados.getProdutoPlanejado(id),
    'produtosPlanejados:create': (_, data) => produtosPlanejados.createProdutoPlanejado(data),
    'produtosPlanejados:update': (_, id, data) => produtosPlanejados.updateProdutoPlanejado(id, data),
    'produtosPlanejados:delete': (_, id) => produtosPlanejados.deleteProdutoPlanejado(id),
    'localizacoes:list': () => services.listLocalizacoes(),
    'localizacoes:create': (_, data) => services.createLocalizacao(data),
    'localizacoes:update': (_, id, data) => services.updateLocalizacao(id, data),
    'localizacoes:delete': (_, id) => services.deleteLocalizacao(id),
    'produtos:list': (_, busca) => services.listProdutos(busca),
    'produtos:get': (_, id) => services.getProduto(id),
    'produtos:create': (_, data) => services.createProduto(data),
    'produtos:update': (_, id, data) => services.updateProduto(id, data),
    'produtos:delete': (_, id) => services.deleteProduto(id),
    'produtos:foto': (_, id) => services.getProdutoFoto(id),
    'produtos:etiqueta': async (_, data) => {
      const produto = await services.getProduto(data.produto_id);
      if (!produto) throw new Error('Produto não encontrado.');
      const sku = data.sku || produto.sku;
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar etiqueta do produto',
        defaultPath: `Etiqueta-${sku}.pdf`,
      }, (filePath) => gerarPdfEtiquetaProduto(filePath, {
        sku,
        nome: data.nome || produto.nome,
        tamanho: data.tamanho || null,
        acabamento: data.acabamento || null,
        valor_prazo: data.valor_prazo != null
          ? Number(data.valor_prazo)
          : Number(data.preco_venda ?? produto.preco_venda),
        desconto_pct: data.desconto_pct,
        copias: data.copias != null ? Number(data.copias) : undefined,
      }));
    },
    'etiquetas:imprimir': async (_, data) => {
      const etiquetas = data?.etiquetas;
      if (!etiquetas?.length) throw new Error('Nenhuma etiqueta na seleção.');
      const total = etiquetas.length;
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar folhas de etiquetas',
        defaultPath: `Etiquetas-${total}.pdf`,
      }, (filePath) => gerarPdfFolhasEtiquetas(filePath, etiquetas));
    },
    'estoque:list': (_, busca) => services.listEstoque(busca),
    'estoque:pendenciasAlocacao': (_, busca) => services.listPendenciasAlocacao(busca),
    'estoque:alocar': (_, data) => services.alocarProduto(data),
    'movimentacoes:list': (_, limite) => services.listMovimentacoes(limite),
    'movimentacoes:create': (_, data) => services.registrarMovimentacao(data),
    'clientes:list': (_, busca) => clientes.listClientes(busca),
    'clientes:get': (_, id) => clientes.getCliente(id),
    'clientes:create': (_, data) => clientes.createCliente(data),
    'clientes:update': (_, id, data) => clientes.updateCliente(id, data),
    'orcamentos:list': (_, busca) => orcamentos.listOrcamentos(busca),
    'orcamentos:get': (_, id) => orcamentos.getOrcamento(id),
    'orcamentos:save': (_, data, id) => orcamentos.salvarOrcamento(data, id),
    'orcamentos:updateStatus': (_, id, status, motivo) => orcamentos.updateOrcamentoStatus(id, status, motivo),
    'orcamentos:moverKanban': (_, id, data) => orcamentos.moverOrcamentoKanban(id, data),
    'orcamentos:marketing': (_, motivo) => orcamentos.listClientesMarketing(motivo),
    'orcamentos:delete': (_, id) => orcamentos.deleteOrcamento(id),
    'orcamentos:pdf': async (_, id) => {
      const data = await orcamentos.getOrcamento(id);
      if (!data) throw new Error('Orçamento não encontrado.');
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar orçamento em PDF',
        defaultPath: `Orcamento-${data.numero}.pdf`,
      }, (filePath) => gerarPdfOrcamento(filePath, id));
    },
    'orcamentosPlanejados:list': (_, busca) => orcamentosPlanejados.listOrcamentosPlanejados(busca),
    'orcamentosPlanejados:get': (_, id) => orcamentosPlanejados.getOrcamentoPlanejado(id),
    'orcamentosPlanejados:save': (_, data, id) => orcamentosPlanejados.salvarOrcamentoPlanejado(data, id),
    'orcamentosPlanejados:moverKanban': (_, id, data) => orcamentosPlanejados.moverOrcamentoPlanejadoKanban(id, data),
    'orcamentosPlanejados:delete': (_, id) => orcamentosPlanejados.deleteOrcamentoPlanejado(id),
    'orcamentosPlanejados:pdf': async (_, id) => {
      const data = await orcamentosPlanejados.getOrcamentoPlanejado(id);
      if (!data) throw new Error('Orçamento planejado não encontrado.');
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar orçamento planejado em PDF',
        defaultPath: `Orcamento-Planejado-${data.numero}.pdf`,
      }, (filePath) => gerarPdfOrcamentoPlanejado(filePath, id));
    },
    'vendasPlanejados:list': (_, busca) => vendasPlanejados.listVendasPlanejados(busca),
    'vendasPlanejados:get': (_, id) => vendasPlanejados.getVendaPlanejado(id),
    'vendasPlanejados:save': (_, data, id) => vendasPlanejados.salvarVendaPlanejado(data, id),
    'vendasPlanejados:delete': (_, id) => vendasPlanejados.deleteVendaPlanejado(id),
    'vendasPlanejados:abrirAnexo': (_, vendaId, anexoId) => vendasPlanejados.abrirAnexoVendaPlanejado(vendaId, anexoId),
    'vendasPlanejados:pdf': async (_, id) => {
      const data = await vendasPlanejados.getVendaPlanejado(id);
      if (!data) throw new Error('Venda planejada não encontrada.');
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar pedido planejado em PDF',
        defaultPath: `Venda-Planejada-${data.numero}.pdf`,
      }, (filePath) => gerarPdfVendaPlanejado(filePath, id));
    },
    'acompanhamentoPedidosPlanejados:list': (_, busca) => acompanhamentoPedidosPlanejados.listAcompanhamentoPedidos(busca),
    'acompanhamentoPedidosPlanejados:moverKanban': (_, id, data) => acompanhamentoPedidosPlanejados.moverAcompanhamentoKanban(id, data),
    'acompanhamentoPedidosPlanejados:criarAssistencia': (_, data) => acompanhamentoPedidosPlanejados.criarAssistenciaTecnica(data),
    'acompanhamentoPedidosPlanejados:listAnotacoes': (_, id) => acompanhamentoPedidosPlanejados.listAnotacoes(id),
    'acompanhamentoPedidosPlanejados:adicionarAnotacao': (_, id, texto) => acompanhamentoPedidosPlanejados.adicionarAnotacao(id, texto),
    'acompanhamentoPedidosPlanejados:atualizarAnotacao': (_, id, texto) => acompanhamentoPedidosPlanejados.atualizarAnotacao(id, texto),
    'acompanhamentoPedidosPlanejados:excluirAnotacao': (_, id) => acompanhamentoPedidosPlanejados.excluirAnotacao(id),
    'analiseVendas:visaoGeral': (_, filtros) => analiseVendas.getVisaoGeralVendas(filtros),
    'analiseVendas:detalhe': (_, id) => analiseVendas.getVendaAnaliseMarkup(id),
    'analiseVendas:ajustesComissao': (_, filtros) => analiseVendas.listAjustesComissao(filtros),
    'vendas:list': (_, busca) => vendas.listVendas(busca),
    'vendas:listDesativadas': (_, busca) => vendas.listVendasDesativadas(busca),
    'vendas:get': (_, id) => vendas.getVenda(id),
    'vendas:save': (_, data, id) => vendas.salvarVenda(data, id),
    'vendas:editar': (_, id, data) => vendaEdicao.editarVenda(id, data),
    'vendas:alteracoes': (_, id) => vendaEdicao.listAlteracoesVenda(id),
    'vendas:delete': (_, id) => vendas.deleteVenda(id),
    'vendas:restaurar': (_, id) => vendas.restaurarVenda(id),
    'vendas:pdf': async (_, id) => {
      const data = await vendas.getVenda(id);
      if (!data) throw new Error('Venda não encontrada.');
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar pedido de venda em PDF',
        defaultPath: `Venda-${data.numero}.pdf`,
      }, (filePath) => gerarPdfVenda(filePath, id));
    },
    'vendas:pdf-alteracao': async (_, id) => {
      const data = await vendas.getVenda(id);
      if (!data) throw new Error('Venda não encontrada.');
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar comprovante de alteração',
        defaultPath: `Alteracao-${data.numero_pedido || data.numero}.pdf`,
      }, (filePath) => gerarPdfAlteracaoVenda(filePath, id));
    },
    'entregas:list': (_, filtro, busca) => entregas.listEntregas(filtro, busca),
    'entregas:listAgendadas': (_, busca) => entregas.listEntregasAgendadas(busca),
    'entregas:get': (_, id) => entregas.getEntrega(id),
    'entregas:update': (_, id, data) => entregas.atualizarEntrega(id, data),
    'entregas:updateKanban': (_, id, data) => entregas.atualizarEntregaKanban(id, data),
    'entregas:confirmarAgendamento': (_, id) => entregas.confirmarAgendamentoCliente(id),
    'entregas:agendar': (_, vendaId, data) => entregas.agendarExpedicao(vendaId, data),
    'entregas:assistencia': (_, data) => entregas.criarAssistenciaEntrega(data),
    'entregas:registrar': (_, id, data) => entregas.registrarEntrega(id, data),
    'entregas:pdf': async (_, id) => {
      const data = await entregas.getEntrega(id);
      if (!data) throw new Error('Entrega não encontrada.');
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar ticket de entrega em PDF',
        defaultPath: `Entrega-${data.numero_pedido || data.venda_numero}.pdf`,
      }, (filePath) => gerarPdfEntrega(filePath, id));
    },
    'encomendas:list': (_, busca) => encomendas.listEncomendasFornecedor(busca),
    'encomendas:get': (_, id) => encomendas.getEncomendaFornecedor(id),
    'encomendas:save': (_, data, id) => encomendas.salvarEncomendaFornecedor(data, id),
    'encomendas:delete': (_, id) => encomendas.deleteEncomendaFornecedor(id),
    'encomendas:updateStatus': (_, id, status) => encomendas.updateEncomendaFornecedorStatus(id, status),
    'encomendas:pendencias': (_, fornecedorId, busca) => encomendas.listPendenciasEncomenda(fornecedorId, busca),
    'encomendas:resumoPendencias': () => encomendas.getResumoPendenciasEncomenda(),
    'encomendas:pendentesRecebimento': (_, busca) => encomendas.listItensPendentesRecebimento(busca),
    'encomendas:controleRecebimento': (_, filtro, busca) => encomendas.listItensControleRecebimento(filtro, busca),
    'encomendas:historicoRecebimentos': (_, busca) => encomendas.listHistoricoRecebimentos(busca),
    'etiquetas:recebimentos': (_, busca) => etiquetas.listRecebimentosParaEtiquetas(busca),
    'encomendas:estornarRecebimento': (_, id) => encomendas.estornarRecebimento(id),
    'encomendas:receber': (_, data) => encomendas.receberEncomendaItem(data),
    'encomendas:disponibilidade': (_, produtoId) => encomendas.getDisponibilidadeProduto(produtoId),
    'encomendas:pdf': async (_, id) => {
      const data = await encomendas.getEncomendaFornecedor(id);
      if (!data) throw new Error('Encomenda não encontrada.');
      const fornecedorSlug = String(data.fornecedor_nome || 'Fornecedor')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 40);
      return salvarEAbrirPdf(mainWindow, {
        title: 'Salvar pedido ao fornecedor em PDF',
        defaultPath: `Encomenda-${data.numero}-${fornecedorSlug}.pdf`,
      }, (filePath) => gerarPdfEncomendaFornecedor(filePath, id));
    },
    'vendedores:list': (_, busca, classificacao) => vendedores.listVendedores(busca, classificacao),
    'vendedores:get': (_, id) => vendedores.getVendedor(id),
    'vendedores:create': (_, data) => vendedores.createVendedor(data),
    'vendedores:update': (_, id, data) => vendedores.updateVendedor(id, data),
    'vendedores:delete': (_, id) => vendedores.deleteVendedor(id),
    'arquivo:list': (_, filtros) => arquivo.listArquivoRegistros(filtros),
    'arquivo:get': (_, id) => arquivo.getArquivoRegistro(id),
    'arquivo:restaurar': (_, id) => arquivo.restaurarArquivoRegistro(id),
    'comissaoRegras:list': () => comissaoRegras.listComissaoRegras(),
    'comissaoRegras:get': (_, perfil) => comissaoRegras.getComissaoRegra(perfil),
    'comissaoRegras:save': (_, data) => comissaoRegras.salvarComissaoRegra(data),
    'comissaoVendas:list': (_, filtros) => comissaoVendas.listControleComissoes(filtros),
    'comissaoVendas:sync': () => comissaoVendas.sincronizarComissoes(),
    'comissaoPagamentos:mensal': (_, filtros) => comissaoPagamentos.getControleMensalComissoes(filtros),
    'comissaoPagamentos:ajustes': (_, filtros) => comissaoPagamentos.listAjustesComissaoMes(filtros),
    'comissaoPagamentos:save': (_, data) => comissaoPagamentos.salvarPagamentoComissao(data),
    'comissaoPagamentos:delete': (_, id) => comissaoPagamentos.excluirPagamentoComissao(id),
    'comissaoRegrasPlanejados:get': () => comissaoRegrasPlanejados.getComissaoRegraPlanejados(),
    'comissaoRegrasPlanejados:save': (_, data) => comissaoRegrasPlanejados.salvarComissaoRegraPlanejados(data),
    'comissaoPlanejados:mensal': (_, filtros) => comissaoPlanejados.getControleMensalPlanejados(filtros),
    'comissaoPlanejados:sync': (_, ano) => comissaoPlanejados.sincronizarComissoesPlanejados(ano),
    'comissaoPlanejados:pagamento': (_, data) => comissaoPlanejados.salvarPagamentoComissaoPlanejado(data),
    'comissaoPlanejados:pagamentoDelete': (_, id) => comissaoPlanejados.excluirPagamentoComissaoPlanejado(id),
    'system:openExternal': (_, url) => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        throw new Error('URL inválida.');
      }
      return shell.openExternal(url);
    },
  };

  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        auth.assertChannelAccess(channel);
        return { success: true, data: await handler(event, ...args) };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
  });
}

app.whenReady().then(async () => {
  try {
    await initDatabase();
    await initImages();
    await orcamentos.marcarOrcamentosExpirados();
    await orcamentosPlanejados.marcarOrcamentosPlanejadosExpirados();
    registerHandlers();
    createWindow();
  } catch (error) {
    console.error('Erro ao iniciar:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
