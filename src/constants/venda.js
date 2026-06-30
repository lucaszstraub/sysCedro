export function normalizarNumeroPedido(valor) {
  const numero = String(valor || '').trim();
  if (!/^\d{5}$/.test(numero)) {
    throw new Error('O número do pedido deve ter exatamente 5 dígitos.');
  }
  return numero;
}

/** @deprecated Use formas de pagamento do cadastro */
export const TIPOS_PAGAMENTO = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'credito', label: 'Cartão crédito' },
  { value: 'debito', label: 'Cartão débito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cheque', label: 'Cheque' },
];

export const TIPO_PAGAMENTO_LABEL = Object.fromEntries(
  TIPOS_PAGAMENTO.map((t) => [t.value, t.label])
);

export { criarLinhaPagamento as criarPagamento, calcularTotalPagamentos } from './pagamento';

export function calcularSubtotalItens(ambientes) {
  return (ambientes || []).reduce((sum, ambiente) => sum + (ambiente.itens || []).reduce(
    (acc, item) => acc + (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0),
    0
  ), 0);
}

export function formaPermiteParcelas(formaPagamentoId, formasCadastro = []) {
  const nome = (formasCadastro.find((f) => String(f.id) === String(formaPagamentoId))?.nome || '').toLowerCase();
  return nome.includes('crédito') || nome.includes('credito') || nome.includes('cartão') || nome.includes('cartao');
}

export function aplicarPrecosEfetivos(ambientes, totalPago) {
  const resultado = (ambientes || []).map((amb) => ({
    ...amb,
    itens: (amb.itens || []).map((item) => ({ ...item })),
  }));

  const entries = [];
  resultado.forEach((amb, ambienteIndex) => {
    amb.itens.forEach((item, itemIndex) => {
      entries.push({ ambienteIndex, itemIndex, item });
    });
  });

  if (entries.length === 0) return resultado;

  const subtotalBruto = entries.reduce(
    (s, { item }) => s + (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0),
    0
  );

  if (subtotalBruto <= 0) return resultado;

  const total = Number(totalPago) || 0;
  let acumulado = 0;

  entries.forEach(({ ambienteIndex, itemIndex, item }, index) => {
    const qty = Number(item.quantidade) || 1;
    const lista = Number(item.preco_unitario) || 0;
    let efetivo = lista;

    if (total > 0 && total !== subtotalBruto) {
      if (index === entries.length - 1) {
        const restante = total - acumulado;
        efetivo = qty > 0 ? Math.round((restante / qty) * 100) / 100 : lista;
      } else {
        const linhaBruta = lista * qty;
        const linhaEfetiva = Math.round(((linhaBruta / subtotalBruto) * total) * 100) / 100;
        efetivo = qty > 0 ? Math.round((linhaEfetiva / qty) * 100) / 100 : lista;
        acumulado += efetivo * qty;
      }
    }

    resultado[ambienteIndex].itens[itemIndex] = {
      ...item,
      preco_unitario_lista: lista,
      preco_unitario: efetivo,
    };
  });

  return resultado;
}

export function precosEfetivosPreview(ambientes, totalPago) {
  return aplicarPrecosEfetivos(ambientes, totalPago);
}
