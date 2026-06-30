const STATUS_ITEM_VENDA = ['efetivo', 'consignado', 'cancelado'];

const STATUS_ITEM_VENDA_LABEL = {
  efetivo: 'Efetivo',
  consignado: 'Consignado',
  cancelado: 'Cancelado',
};

function normalizarStatusItem(status) {
  const valor = String(status || 'efetivo').trim().toLowerCase();
  if (!STATUS_ITEM_VENDA.includes(valor)) {
    throw new Error('Status do item inválido. Use Efetivo, Consignado ou Cancelado.');
  }
  return valor;
}

function itemContaParaTotal(status) {
  return normalizarStatusItem(status) === 'efetivo';
}

function itemContaParaMarkup(status) {
  return normalizarStatusItem(status) === 'efetivo';
}

function itemPendenteEntrega(status) {
  const s = normalizarStatusItem(status);
  return s === 'efetivo' || s === 'consignado';
}

function filtrarItensParaTotal(itens = []) {
  return itens.filter((item) => itemContaParaTotal(item.status));
}

function filtrarAmbientesParaTotal(ambientes = []) {
  return (ambientes || [])
    .map((ambiente) => ({
      ...ambiente,
      itens: (ambiente.itens || []).filter((item) => itemContaParaTotal(item.status)),
    }))
    .filter((ambiente) => ambiente.itens.length > 0);
}

module.exports = {
  STATUS_ITEM_VENDA,
  STATUS_ITEM_VENDA_LABEL,
  normalizarStatusItem,
  itemContaParaTotal,
  itemContaParaMarkup,
  itemPendenteEntrega,
  filtrarItensParaTotal,
  filtrarAmbientesParaTotal,
};
