export function criarLinhaPagamento(formaPagamentoId = '', extras = {}) {
  return {
    id: `pag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    forma_pagamento_id: formaPagamentoId ? String(formaPagamentoId) : '',
    valor: 0,
    parcelas: 1,
    observacao: '',
    data_recebimento: extras.data_recebimento || null,
  };
}

export function hojeIso() {
  return new Date().toISOString().split('T')[0];
}

export function calcularTotalPagamentos(pagamentos) {
  return (pagamentos || []).reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
}

export function calcularAjustePagamentoSubtotal(subtotal, totalPago) {
  const sub = Number(subtotal) || 0;
  const pago = Number(totalPago) || 0;
  const diff = pago - sub;
  return {
    descontoExtra: Math.max(-diff, 0),
    acrescimoExtra: Math.max(diff, 0),
    temAjustePreco: Math.abs(diff) > 0.005,
  };
}

export function isPagamentoLegado(forma) {
  return forma != null
    && forma.desconto_percentual != null
    && (forma.valor == null || forma.valor === '');
}

export function mapPagamentosFromApi(pagamentos = [], formasCadastro = []) {
  if (!pagamentos.length) return [criarLinhaPagamento(formasCadastro[0]?.id)];

  if (pagamentos.some(isPagamentoLegado)) {
    return pagamentos.map((forma) => criarLinhaPagamento(forma.forma_pagamento_id || ''));
  }

  return pagamentos.map((pag) => ({
    id: pag.id || criarLinhaPagamento().id,
    forma_pagamento_id: pag.forma_pagamento_id ? String(pag.forma_pagamento_id) : '',
    forma_nome: pag.forma_nome || null,
    valor: Number(pag.valor) || 0,
    parcelas: Number(pag.parcelas) || 1,
    observacao: pag.observacao || '',
    data_recebimento: pag.data_recebimento || null,
  }));
}

export function getFormaPagamentoLabel(formaPagamentoId, formasCadastro = []) {
  const id = Number(formaPagamentoId);
  const found = formasCadastro.find((f) => f.id === id);
  return found?.nome || '—';
}

export function normalizarNomeFormaPagamento(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isFormaAReceber(formaPagamentoId, formasCadastro = [], formaNome = null) {
  if (formaNome && normalizarNomeFormaPagamento(formaNome) === 'a receber') {
    return true;
  }
  const nome = getFormaPagamentoLabel(formaPagamentoId, formasCadastro);
  return normalizarNomeFormaPagamento(nome) === 'a receber';
}

export function isPagamentoLinhaAReceber(pagamento, formasCadastro = []) {
  return isFormaAReceber(
    pagamento?.forma_pagamento_id,
    formasCadastro,
    pagamento?.forma_nome
  );
}
