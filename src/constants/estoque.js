export const CODIGO_LOCALIZACAO_NAO_ALOCADOS = 'NAO-ALOC';

export function isLocalizacaoNaoAlocados(localizacao) {
  return localizacao?.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS;
}

export function labelTipoMovimentacao(mov) {
  if (mov.referencia_tipo === 'alocacao') return 'Alocação';
  if (mov.referencia_tipo === 'encomenda_recebimento') return 'Recebimento';
  if (mov.referencia_tipo === 'encomenda_estorno') return 'Estorno receb.';
  const tipos = {
    entrada: 'Entrada',
    saida: 'Saída',
    transferencia: 'Transferência',
    ajuste: 'Ajuste',
  };
  return tipos[mov.tipo] || mov.tipo;
}

export function badgeClassMovimentacao(mov) {
  if (mov.referencia_tipo === 'alocacao') return 'badge-alocacao';
  if (mov.referencia_tipo === 'encomenda_recebimento') return 'badge-entrada';
  return `badge-${mov.tipo}`;
}
