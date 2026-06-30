export function buildVendaSnapshot({
  clienteId,
  vendedorId,
  orcamentoId,
  numeroPedido,
  observacoes,
  entregaTipoLiberacao,
  pagamentos,
  ambientes,
}) {
  const normalized = {
    clienteId: clienteId || '',
    vendedorId: vendedorId || '',
    orcamentoId: orcamentoId || '',
    numeroPedido: numeroPedido || '',
    observacoes: observacoes || '',
    entregaTipoLiberacao: entregaTipoLiberacao || 'parcial',
    pagamentos: (pagamentos || []).map((p) => ({
      id: p.id,
      forma_pagamento_id: p.forma_pagamento_id ? String(p.forma_pagamento_id) : '',
      valor: Number(p.valor) || 0,
      parcelas: Number(p.parcelas) || 1,
      observacao: p.observacao || '',
    })),
    ambientes: (ambientes || []).map((amb) => ({
      nome: (amb.nome || '').trim(),
      itens: (amb.itens || [])
        .filter((item) => item.descricao?.trim())
        .map((item) => ({
          produto_id: item.produto_id || null,
          descricao: item.descricao.trim(),
          quantidade: Number(item.quantidade) || 1,
          quantidade_estoque: Number(item.quantidade_estoque) || 0,
          quantidade_encomenda: Number(item.quantidade_encomenda) || 0,
          preco_unitario: Number(item.preco_unitario) || 0,
        })),
    })),
  };
  return JSON.stringify(normalized);
}
