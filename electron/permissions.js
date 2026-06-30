const PERMISSIONS = {
  WMS: 'wms',
  VENDAS: 'vendas',
  GERENCIAL: 'gerencial',
  PLANEJADOS: 'planejados',
  CADASTROS: 'cadastros',
  USUARIOS: 'usuarios',
  PARCEIROS: 'parceiros',
};

const ATRIBUICOES = {
  LOGISTICA: 'logistica',
  VENDEDOR: 'vendedor',
  VENDEDOR_PROJETISTA: 'vendedor_projetista',
  GERENTE: 'gerente',
  ADMINISTRACAO: 'administracao',
};

const ROLE_PERMISSIONS = {
  [ATRIBUICOES.LOGISTICA]: [PERMISSIONS.WMS],
  [ATRIBUICOES.VENDEDOR]: [PERMISSIONS.VENDAS],
  [ATRIBUICOES.VENDEDOR_PROJETISTA]: [PERMISSIONS.PLANEJADOS],
  [ATRIBUICOES.GERENTE]: [
    PERMISSIONS.WMS,
    PERMISSIONS.VENDAS,
    PERMISSIONS.GERENCIAL,
    PERMISSIONS.PLANEJADOS,
    PERMISSIONS.CADASTROS,
    PERMISSIONS.PARCEIROS,
  ],
  [ATRIBUICOES.ADMINISTRACAO]: [
    PERMISSIONS.WMS,
    PERMISSIONS.VENDAS,
    PERMISSIONS.GERENCIAL,
    PERMISSIONS.PLANEJADOS,
    PERMISSIONS.CADASTROS,
    PERMISSIONS.USUARIOS,
    PERMISSIONS.PARCEIROS,
  ],
};

const CHANNEL_PERMISSIONS = {
  'auth:login': null,
  'auth:restore': null,
  'auth:logout': 'session',
  'auth:me': 'session',

  'usuarios:list': 'administracao',
  'usuarios:get': 'administracao',
  'usuarios:create': 'administracao',
  'usuarios:update': 'administracao',
  'usuarios:delete': 'administracao',

  'colaboradores:list': 'administracao',
  'colaboradores:get': 'administracao',
  'colaboradores:usuarios': 'administracao',
  'colaboradores:create': 'administracao',
  'colaboradores:update': 'administracao',
  'colaboradores:delete': 'administracao',

  'custosFixos:template:list': 'administracao',
  'custosFixos:template:create': 'administracao',
  'custosFixos:template:update': 'administracao',
  'custosFixos:template:delete': 'administracao',
  'custosFixos:exercicio': 'administracao',
  'custosFixos:mes': 'administracao',
  'custosFixos:mensal:update': 'administracao',
  'custosFixos:extra:create': 'administracao',
  'custosFixos:mensal:delete': 'administracao',
  'custosFixos:aplicarMes': 'administracao',
  'custosFixos:aplicarExercicio': 'administracao',

  'centrosCusto:list': 'administracao',
  'centrosCusto:get': 'administracao',
  'centrosCusto:create': 'administracao',
  'centrosCusto:update': 'administracao',
  'centrosCusto:delete': 'administracao',
  'pagamentosFinanceiros:list': 'administracao',
  'pagamentosFinanceiros:get': 'administracao',
  'pagamentosFinanceiros:create': 'administracao',
  'pagamentosFinanceiros:update': 'administracao',
  'pagamentosFinanceiros:delete': 'administracao',

  'notasFiscais:list': PERMISSIONS.WMS,
  'notasFiscais:get': PERMISSIONS.WMS,
  'notasFiscais:create': PERMISSIONS.WMS,

  'dashboard:get': PERMISSIONS.WMS,
  'estoque:list': PERMISSIONS.WMS,
  'estoque:pendenciasAlocacao': PERMISSIONS.WMS,
  'estoque:alocar': PERMISSIONS.WMS,
  'movimentacoes:list': PERMISSIONS.WMS,
  'movimentacoes:create': PERMISSIONS.WMS,
  'entregas:list': PERMISSIONS.WMS,
  'entregas:listAgendadas': PERMISSIONS.WMS,
  'entregas:get': PERMISSIONS.WMS,
  'entregas:update': PERMISSIONS.WMS,
  'entregas:updateKanban': PERMISSIONS.WMS,
  'entregas:agendar': PERMISSIONS.WMS,
  'entregas:assistencia': PERMISSIONS.WMS,
  'entregas:registrar': PERMISSIONS.WMS,
  'entregas:pdf': PERMISSIONS.WMS,
  'encomendas:pendentesRecebimento': PERMISSIONS.WMS,
  'encomendas:controleRecebimento': PERMISSIONS.WMS,
  'encomendas:historicoRecebimentos': PERMISSIONS.WMS,
  'encomendas:estornarRecebimento': PERMISSIONS.WMS,
  'encomendas:receber': PERMISSIONS.WMS,

  'orcamentos:list': PERMISSIONS.VENDAS,
  'orcamentos:get': PERMISSIONS.VENDAS,
  'orcamentos:save': PERMISSIONS.VENDAS,
  'orcamentos:updateStatus': PERMISSIONS.VENDAS,
  'orcamentos:moverKanban': PERMISSIONS.VENDAS,
  'orcamentos:marketing': PERMISSIONS.VENDAS,
  'orcamentos:delete': PERMISSIONS.VENDAS,
  'orcamentos:pdf': PERMISSIONS.VENDAS,
  'vendas:list': PERMISSIONS.VENDAS,
  'vendas:get': PERMISSIONS.VENDAS,
  'vendas:save': PERMISSIONS.VENDAS,
  'vendas:editar': PERMISSIONS.VENDAS,
  'vendas:alteracoes': PERMISSIONS.VENDAS,
  'vendas:delete': PERMISSIONS.VENDAS,
  'vendas:listDesativadas': PERMISSIONS.GERENCIAL,
  'vendas:restaurar': PERMISSIONS.GERENCIAL,
  'vendas:pdf': PERMISSIONS.VENDAS,
  'vendas:pdf-alteracao': PERMISSIONS.VENDAS,

  'encomendas:list': PERMISSIONS.GERENCIAL,
  'encomendas:get': PERMISSIONS.GERENCIAL,
  'encomendas:save': PERMISSIONS.GERENCIAL,
  'encomendas:delete': PERMISSIONS.GERENCIAL,
  'encomendas:updateStatus': PERMISSIONS.GERENCIAL,
  'encomendas:pendencias': PERMISSIONS.GERENCIAL,
  'encomendas:resumoPendencias': PERMISSIONS.GERENCIAL,
  'encomendas:disponibilidade': PERMISSIONS.GERENCIAL,
  'encomendas:pdf': PERMISSIONS.GERENCIAL,
  'analiseVendas:visaoGeral': PERMISSIONS.GERENCIAL,
  'analiseVendas:detalhe': PERMISSIONS.GERENCIAL,
  'analiseVendas:ajustesComissao': PERMISSIONS.GERENCIAL,

  'orcamentosPlanejados:list': PERMISSIONS.PLANEJADOS,
  'orcamentosPlanejados:get': PERMISSIONS.PLANEJADOS,
  'orcamentosPlanejados:save': PERMISSIONS.PLANEJADOS,
  'orcamentosPlanejados:moverKanban': PERMISSIONS.PLANEJADOS,
  'orcamentosPlanejados:delete': PERMISSIONS.PLANEJADOS,
  'orcamentosPlanejados:pdf': PERMISSIONS.PLANEJADOS,

  'vendasPlanejados:list': PERMISSIONS.PLANEJADOS,
  'vendasPlanejados:get': PERMISSIONS.PLANEJADOS,
  'vendasPlanejados:save': PERMISSIONS.PLANEJADOS,
  'vendasPlanejados:delete': PERMISSIONS.PLANEJADOS,
  'vendasPlanejados:abrirAnexo': PERMISSIONS.PLANEJADOS,
  'vendasPlanejados:pdf': PERMISSIONS.PLANEJADOS,

  'produtosPlanejados:listAll': PERMISSIONS.PLANEJADOS,
  'produtosPlanejados:get': PERMISSIONS.PLANEJADOS,
  'produtosPlanejados:create': PERMISSIONS.PLANEJADOS,
  'produtosPlanejados:update': PERMISSIONS.PLANEJADOS,
  'produtosPlanejados:delete': PERMISSIONS.PLANEJADOS,

  'acompanhamentoPedidosPlanejados:list': PERMISSIONS.PLANEJADOS,
  'acompanhamentoPedidosPlanejados:moverKanban': PERMISSIONS.PLANEJADOS,
  'acompanhamentoPedidosPlanejados:criarAssistencia': PERMISSIONS.PLANEJADOS,
  'acompanhamentoPedidosPlanejados:listAnotacoes': PERMISSIONS.PLANEJADOS,
  'acompanhamentoPedidosPlanejados:adicionarAnotacao': PERMISSIONS.PLANEJADOS,
  'acompanhamentoPedidosPlanejados:atualizarAnotacao': PERMISSIONS.PLANEJADOS,
  'acompanhamentoPedidosPlanejados:excluirAnotacao': PERMISSIONS.PLANEJADOS,

  'categorias:list': PERMISSIONS.CADASTROS,
  'produtos:list': PERMISSIONS.CADASTROS,
  'produtos:get': PERMISSIONS.CADASTROS,
  'produtos:delete': PERMISSIONS.CADASTROS,
  'fornecedores:list': PERMISSIONS.CADASTROS,
  'fornecedores:get': PERMISSIONS.CADASTROS,
  'fornecedores:create': PERMISSIONS.CADASTROS,
  'fornecedores:update': PERMISSIONS.CADASTROS,
  'fornecedores:delete': PERMISSIONS.CADASTROS,
  'formasPagamento:list': PERMISSIONS.CADASTROS,
  'formasPagamento:listAll': PERMISSIONS.CADASTROS,
  'formasPagamento:get': PERMISSIONS.CADASTROS,
  'formasPagamento:create': PERMISSIONS.CADASTROS,
  'formasPagamento:update': PERMISSIONS.CADASTROS,
  'formasPagamento:delete': PERMISSIONS.CADASTROS,
  'vendedores:list': PERMISSIONS.CADASTROS,
  'vendedores:get': PERMISSIONS.CADASTROS,
  'vendedores:create': PERMISSIONS.CADASTROS,
  'vendedores:update': PERMISSIONS.CADASTROS,
  'vendedores:delete': PERMISSIONS.CADASTROS,
  'localizacoes:list': PERMISSIONS.CADASTROS,
  'localizacoes:create': PERMISSIONS.CADASTROS,
  'localizacoes:update': PERMISSIONS.CADASTROS,
  'localizacoes:delete': PERMISSIONS.CADASTROS,

  'arquivo:list': 'administracao',
  'arquivo:get': 'administracao',
  'arquivo:restaurar': 'administracao',

  'comissaoRegras:list': 'administracao',
  'comissaoRegras:get': 'administracao',
  'comissaoRegras:save': 'administracao',

  'comissaoVendas:list': 'administracao',
  'comissaoVendas:sync': 'administracao',

  'comissaoPagamentos:mensal': 'administracao',
  'comissaoPagamentos:ajustes': 'administracao',
  'comissaoPagamentos:save': 'administracao',
  'comissaoPagamentos:delete': 'administracao',

  'comissaoRegrasPlanejados:get': 'administracao',
  'comissaoRegrasPlanejados:save': 'administracao',
  'comissaoPlanejados:mensal': 'administracao',
  'comissaoPlanejados:sync': 'administracao',
  'comissaoPlanejados:pagamento': 'administracao',
  'comissaoPlanejados:pagamentoDelete': 'administracao',

  'parceiros:list': PERMISSIONS.PARCEIROS,
  'parceiros:get': PERMISSIONS.PARCEIROS,
  'parceiros:create': PERMISSIONS.PARCEIROS,
  'parceiros:update': PERMISSIONS.PARCEIROS,
  'parceiros:delete': PERMISSIONS.PARCEIROS,

  'incentivosParceiro:list': PERMISSIONS.PARCEIROS,
  'incentivosParceiro:buscarVendas': PERMISSIONS.PARCEIROS,
  'incentivosParceiro:get': PERMISSIONS.PARCEIROS,
  'incentivosParceiro:save': PERMISSIONS.PARCEIROS,
  'incentivosParceiro:delete': PERMISSIONS.PARCEIROS,
};

const SHARED_CHANNELS = {
  'clientes:list': [PERMISSIONS.VENDAS, PERMISSIONS.PLANEJADOS, PERMISSIONS.GERENCIAL, PERMISSIONS.CADASTROS],
  'clientes:get': [PERMISSIONS.VENDAS, PERMISSIONS.PLANEJADOS, PERMISSIONS.GERENCIAL, PERMISSIONS.CADASTROS],
  'clientes:create': [PERMISSIONS.VENDAS, PERMISSIONS.PLANEJADOS, PERMISSIONS.GERENCIAL],
  'clientes:update': [PERMISSIONS.VENDAS, PERMISSIONS.PLANEJADOS, PERMISSIONS.GERENCIAL],
  'fornecedores:list': [
    PERMISSIONS.CADASTROS,
    PERMISSIONS.GERENCIAL,
    PERMISSIONS.WMS,
    PERMISSIONS.VENDAS,
  ],
  'fornecedores:create': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS],
  'formasPagamento:list': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS, PERMISSIONS.PLANEJADOS],
  'produtosPlanejados:list': [PERMISSIONS.PLANEJADOS],
  'vendedores:list': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS, PERMISSIONS.PLANEJADOS],
  'categorias:list': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS, PERMISSIONS.WMS],
  'produtos:list': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS, PERMISSIONS.GERENCIAL, PERMISSIONS.WMS],
  'produtos:get': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS, PERMISSIONS.GERENCIAL, PERMISSIONS.WMS],
  'produtos:create': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS],
  'produtos:update': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS],
  'produtos:foto': [PERMISSIONS.CADASTROS, PERMISSIONS.VENDAS],
  'localizacoes:list': [PERMISSIONS.CADASTROS, PERMISSIONS.WMS],
};

function userHasPermission(user, permission) {
  if (!user) return false;
  if (user.is_master) return true;
  const perms = ROLE_PERMISSIONS[user.atribuicao] || [];
  return perms.includes(permission);
}

function userHasAnyPermission(user, permissions) {
  return permissions.some((p) => userHasPermission(user, p));
}

function userIsAdministrador(user) {
  if (!user) return false;
  return user.is_master || user.atribuicao === ATRIBUICOES.ADMINISTRACAO;
}

function userIsGerenteOuAdministrador(user) {
  if (!user) return false;
  if (user.is_master) return true;
  return user.atribuicao === ATRIBUICOES.GERENTE
    || user.atribuicao === ATRIBUICOES.ADMINISTRACAO;
}

function getChannelRequirement(channel) {
  if (Object.prototype.hasOwnProperty.call(SHARED_CHANNELS, channel)) {
    return { type: 'any', permissions: SHARED_CHANNELS[channel] };
  }
  const perm = CHANNEL_PERMISSIONS[channel];
  if (perm === undefined) return { type: 'session' };
  if (perm === null) return { type: 'public' };
  if (perm === 'session') return { type: 'session' };
  if (perm === 'administracao') return { type: 'administracao' };
  return { type: 'single', permission: perm };
}

function isAtribuicaoValida(atribuicao) {
  return Object.values(ATRIBUICOES).includes(atribuicao);
}

module.exports = {
  PERMISSIONS,
  ATRIBUICOES,
  ROLE_PERMISSIONS,
  userHasPermission,
  userHasAnyPermission,
  userIsAdministrador,
  userIsGerenteOuAdministrador,
  getChannelRequirement,
  isAtribuicaoValida,
};
