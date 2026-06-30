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

export const FRETE_PADRAO = 10;
export const IPI_PADRAO = 3.25;

export function calcularCustoComImpostos(custoNegociado, fretePct = FRETE_PADRAO, ipiPct = IPI_PADRAO) {
  const base = Number(custoNegociado) || 0;
  const frete = base * (Number(fretePct) || 0) / 100;
  const ipi = base * (Number(ipiPct) || 0) / 100;
  return Math.round((base + frete + ipi) * 100) / 100;
}

export function calcularFreteUnitario(valorNota, fretePct = FRETE_PADRAO) {
  const base = Number(valorNota) || 0;
  return Math.round(base * (Number(fretePct) || 0) / 100 * 100) / 100;
}

export function calcularIpiUnitario(valorNota, ipiPct = IPI_PADRAO) {
  const base = Number(valorNota) || 0;
  return Math.round(base * (Number(ipiPct) || 0) / 100 * 100) / 100;
}

export function calcularCustoRealRecebimento(valorNota, freteUnitario, ipiUnitario) {
  const base = Number(valorNota) || 0;
  const frete = Number(freteUnitario) || 0;
  const ipi = Number(ipiUnitario) || 0;
  return Math.round((base + frete + ipi) * 100) / 100;
}

export function resolverCustoEsperado(item) {
  const negociado = Number(item.custo_negociado) || 0;
  const comImpostos = Number(item.custo_com_impostos);
  if (comImpostos > 0) return comImpostos;
  return calcularCustoComImpostos(
    negociado,
    item.frete_percentual ?? FRETE_PADRAO,
    item.ipi_percentual ?? IPI_PADRAO
  );
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
