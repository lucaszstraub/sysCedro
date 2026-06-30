export const STATUS_ITEM_VENDA_OPTIONS = [
  { value: 'efetivo', label: 'Efetivo' },
  { value: 'consignado', label: 'Consignado' },
  { value: 'cancelado', label: 'Cancelado' },
];

export const STATUS_ITEM_VENDA_LABEL = Object.fromEntries(
  STATUS_ITEM_VENDA_OPTIONS.map((o) => [o.value, o.label])
);

export function itemContaParaTotal(status) {
  return (status || 'efetivo') === 'efetivo';
}

export function calcularSubtotalItensEfetivos(ambientes) {
  return (ambientes || []).reduce((sum, ambiente) => sum + (ambiente.itens || []).reduce(
    (acc, item) => {
      if (!itemContaParaTotal(item.status)) return acc;
      return acc + (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);
    },
    0
  ), 0);
}
