const dbSync = require('./dbSync');

const OFFLINE_ALLOWED_CHANNELS = new Set([
  'auth:login',
  'auth:logout',
  'auth:me',
  'auth:restore',
  'sync:status',

  'clientes:list',
  'clientes:get',
  'clientes:create',
  'clientes:update',

  'orcamentos:list',
  'orcamentos:get',
  'orcamentos:save',
  'orcamentos:updateStatus',
  'orcamentos:moverKanban',
  'orcamentos:delete',
  'orcamentos:pdf',
  'orcamentos:marketing',

  'orcamentosPlanejados:list',
  'orcamentosPlanejados:get',
  'orcamentosPlanejados:save',
  'orcamentosPlanejados:moverKanban',
  'orcamentosPlanejados:delete',
  'orcamentosPlanejados:pdf',

  'produtos:list',
  'produtos:get',
  'produtosPlanejados:list',
  'produtosPlanejados:listAll',
  'produtosPlanejados:get',
  'categorias:list',
  'fornecedores:list',
  'formasPagamento:list',
  'vendedores:list',
]);

function isHybridMode() {
  return dbSync.isHybridMode();
}

function isOfflineMode() {
  return dbSync.isHybridMode() && !dbSync.isCloudAvailable();
}

function assertOfflineAllowsChannel(channel) {
  if (!isOfflineMode()) return;
  if (OFFLINE_ALLOWED_CHANNELS.has(channel)) return;
  throw new Error(
    'Esta função não está disponível no modo offline. '
    + 'Apenas orçamentos (soltos e planejados) e cadastro de clientes estão liberados.'
  );
}

module.exports = {
  OFFLINE_ALLOWED_CHANNELS,
  isHybridMode,
  isOfflineMode,
  assertOfflineAllowsChannel,
};
