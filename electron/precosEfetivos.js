const {
  normalizarStatusItem,
  itemContaParaTotal,
  itemContaParaMarkup,
  itemPendenteEntrega,
  filtrarAmbientesParaTotal,
} = require('./vendaItemStatus');

function calcularSubtotalBruto(ambientes) {
  const ambientesEfetivos = filtrarAmbientesParaTotal(ambientes);
  const itens = ambientesEfetivos.flatMap((ambiente) => ambiente.itens || []);
  return itens.reduce((sum, item) => {
    const preco = Number(item.preco_unitario_lista ?? item.preco_unitario) || 0;
    return sum + (Number(item.quantidade) || 0) * preco;
  }, 0);
}

function aplicarPrecosEfetivosNosItens(ambientesValidos, totalPago) {
  const entries = [];
  ambientesValidos.forEach((ambiente) => {
    (ambiente.itens || []).forEach((item) => {
      if (itemContaParaTotal(item.status)) entries.push(item);
    });
  });

  const subtotalBruto = entries.reduce(
    (s, item) => s + item.quantidade * (item.preco_unitario_lista ?? item.preco_unitario),
    0
  );

  if (subtotalBruto <= 0) return;

  const total = Number(totalPago) || 0;
  if (total <= 0 || Math.abs(total - subtotalBruto) < 0.005) {
    entries.forEach((item) => {
      const lista = Number(item.preco_unitario_lista ?? item.preco_unitario) || 0;
      item.preco_unitario_lista = lista;
      item.preco_unitario = lista;
    });
    return;
  }

  // Pagamento acima da lista (ex.: item cancelado sem ajuste de pagamento) não
  // infla preço efetivo nem base de comissão — mantém preço de lista.
  if (total > subtotalBruto) {
    entries.forEach((item) => {
      const lista = Number(item.preco_unitario_lista ?? item.preco_unitario) || 0;
      item.preco_unitario_lista = lista;
      item.preco_unitario = lista;
    });
    return;
  }

  let acumulado = 0;
  entries.forEach((item, index) => {
    const qty = item.quantidade;
    const lista = Number(item.preco_unitario_lista ?? item.preco_unitario) || 0;
    item.preco_unitario_lista = lista;

    if (index === entries.length - 1) {
      const restante = total - acumulado;
      item.preco_unitario = qty > 0 ? Math.round((restante / qty) * 100) / 100 : lista;
    } else {
      const linhaBruta = lista * qty;
      const linhaEfetiva = Math.round(((linhaBruta / subtotalBruto) * total) * 100) / 100;
      item.preco_unitario = qty > 0 ? Math.round((linhaEfetiva / qty) * 100) / 100 : lista;
      acumulado += item.preco_unitario * qty;
    }
  });
}

module.exports = {
  calcularSubtotalBruto,
  aplicarPrecosEfetivosNosItens,
};
