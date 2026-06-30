export const AMBIENTE_NOME_PADRAO = 'Geral';

export const STATUS_OPTIONS = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recusado', label: 'Recusado' },
  { value: 'expirado', label: 'Expirado' },
];

export const STATUS_LABEL = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const KANBAN_COLUMNS = [
  { id: 'rascunho', title: 'Rascunho', status: 'rascunho', aceitaDrop: true },
  { id: 'enviado', title: 'Enviado', status: 'enviado', aceitaDrop: true },
  { id: 'aprovado', title: 'Aprovado', status: 'aprovado', aceitaDrop: true },
  {
    id: 'encerrado',
    title: 'Rejeitado / Expirado',
    status: 'encerrado',
    aceitaDrop: true,
    motivoDrop: 'recusado',
  },
];

export const MOTIVO_ENCERRAMENTO_OPTIONS = [
  { value: 'recusado', label: 'Rejeitado pelo cliente' },
  { value: 'expirado', label: 'Expirado (validade)' },
];

export const MOTIVO_ENCERRAMENTO_LABEL = Object.fromEntries(
  MOTIVO_ENCERRAMENTO_OPTIONS.map((m) => [m.value, m.label])
);

export function resolverColunaKanban(orcamento) {
  if (orcamento.status === 'recusado' || orcamento.status === 'expirado') return 'encerrado';
  return orcamento.status;
}

export const VALIDADE_DIAS_OPTIONS = [15, 30, 45, 60, 90];

export const FORMAS_PAGAMENTO_PADRAO = [
  { id: 'avista', nome: 'À vista', desconto_percentual: 10 },
  { id: 'cartao_1_6', nome: 'Cartão 1+6x', desconto_percentual: 5 },
  { id: 'cartao_6_10', nome: 'Cartão 6x a 10x', desconto_percentual: 0 },
];

export function calcularTotalComDesconto(subtotal, descontoPercentual) {
  const valor = Number(subtotal) || 0;
  const pct = Number(descontoPercentual) || 0;
  return Math.max(valor - (valor * pct / 100), 0);
}

export function criarFormaPagamento() {
  return {
    id: `forma_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    nome: '',
    desconto_percentual: 0,
  };
}

export function isFormaPagamentoOrcamentoLegado(forma) {
  return forma != null
    && forma.desconto_percentual != null
    && (forma.valor == null || forma.valor === '');
}

export function mapFormasPagamentoFromOrcamento(orc) {
  const formas = orc?.formas_pagamento || [];
  if (formas.length === 0) {
    return FORMAS_PAGAMENTO_PADRAO.map((f) => ({ ...f }));
  }

  if (formas.some(isFormaPagamentoOrcamentoLegado)) {
    return formas.map((f) => ({
      id: f.id || criarFormaPagamento().id,
      nome: f.nome || '',
      desconto_percentual: Number(f.desconto_percentual) || 0,
    }));
  }

  const subtotal = Number(orc.subtotal) || Number(orc.total) || 0;
  return formas.map((f) => {
    const valor = Number(f.valor) || 0;
    const pct = subtotal > 0
      ? Math.round((1 - valor / subtotal) * 10000) / 100
      : 0;
    return {
      id: f.id || criarFormaPagamento().id,
      nome: f.forma_nome || f.nome || 'Condição',
      desconto_percentual: Math.max(0, Math.min(100, pct)),
    };
  });
}

/** Menor total entre as opções de pagamento do orçamento (para pré-preencher venda). */
export function resolverValorPedidoDesdeOrcamento(orc) {
  const subtotal = Number(orc?.subtotal) || Number(orc?.total) || 0;
  const formas = orc?.formas_pagamento || [];
  if (!formas.length) return subtotal;
  if (formas.some(isFormaPagamentoOrcamentoLegado)) {
    return Math.min(
      ...formas.map((f) => calcularTotalComDesconto(subtotal, f.desconto_percentual))
    );
  }
  const comValor = formas.map((f) => Number(f.valor) || 0).filter((v) => v > 0);
  return comValor.length > 0 ? Math.min(...comValor) : subtotal;
}
