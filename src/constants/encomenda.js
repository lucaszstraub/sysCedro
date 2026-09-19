export const STATUS_OPTIONS = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviada', label: 'Enviada ao fornecedor' },
  { value: 'parcial', label: 'Recebimento parcial' },
  { value: 'recebida', label: 'Recebida' },
  { value: 'cancelada', label: 'Cancelada' },
];

export const STATUS_LABEL = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const DESTINO_OPTIONS = [
  { value: 'cliente', label: 'Cliente (pedido)' },
  { value: 'estoque', label: 'Reposição de estoque' },
];

export const DESTINO_LABEL = Object.fromEntries(
  DESTINO_OPTIONS.map((d) => [d.value, d.label])
);

export const RECEBIMENTO_FILTRO_OPTIONS = [
  { value: 'a_receber', label: 'A receber' },
  { value: 'recebido', label: 'Recebidos' },
  { value: 'todos', label: 'Todos' },
];

export const SITUACAO_RECEBIMENTO_LABEL = {
  a_receber: 'A receber',
  recebido: 'Recebido',
};

export function normalizarNumeroNotaFiscal(valor) {
  const numero = String(valor || '').trim();
  if (!/^\d+$/.test(numero)) {
    throw new Error('Informe o número da nota fiscal (apenas dígitos).');
  }
  return numero;
}

export const PRAZO_ENTREGA_OPCOES = [30, 45, 60, 75, 90];

/** Placeholders padrão no recebimento (percentuais sobre o valor do produto na NF). */
export const FRETE_PADRAO = 10;
export const IPI_PADRAO = 3.5;

export function calcularValorPercentual(base, percentual) {
  const valor = Number(base) || 0;
  const pct = Number(percentual) || 0;
  return Math.round(valor * pct / 100 * 100) / 100;
}

export function calcularCustoRealRecebimento(valorNota, freteUnitario, ipiUnitario) {
  const base = Number(valorNota) || 0;
  const frete = Number(freteUnitario) || 0;
  const ipi = Number(ipiUnitario) || 0;
  return Math.round((base + frete + ipi) * 100) / 100;
}

export function calcularCustoRealRecebimentoPorPercentuais(valorNota, fretePct, ipiPct) {
  const frete = calcularValorPercentual(valorNota, fretePct);
  const ipi = calcularValorPercentual(valorNota, ipiPct);
  return {
    frete_unitario: frete,
    ipi_unitario: ipi,
    custo_real: calcularCustoRealRecebimento(valorNota, frete, ipi),
  };
}

/**
 * Valor usado para markup/comissões na venda — cadastrado na encomenda
 * (não aparece no PDF do fornecedor). Preferência: valor_computado_venda,
 * depois custo_com_impostos (coluna legada).
 */
export function resolverValorComputadoVenda(item) {
  const computado = Number(item?.valor_computado_venda);
  if (Number.isFinite(computado) && computado > 0) return computado;
  const legado = Number(item?.custo_com_impostos);
  if (Number.isFinite(legado) && legado > 0) return legado;
  return 0;
}

/** Alias usado no recebimento: custo esperado = valor computado para venda. */
export function resolverCustoEsperado(item) {
  return resolverValorComputadoVenda(item);
}

export function calcularDataPrevisaoEntrega(dias, dataBase = null) {
  const qtdDias = Number(dias);
  if (!qtdDias || qtdDias <= 0) return '';
  const base = dataBase ? new Date(`${dataBase}T12:00:00`) : new Date();
  base.setDate(base.getDate() + qtdDias);
  return base.toISOString().split('T')[0];
}

export function resolverPrazoDias(opcao, diasCustom) {
  if (opcao === 'custom') return Number(diasCustom) || 0;
  return Number(opcao) || 30;
}
