export function mapAmbientesFromOrcamento(ambientes = []) {
  return ambientes.map((ambiente) => ({
    nome: ambiente.nome,
    itens: ambiente.itens.map((item) => ({
      produto_id: item.produto_id,
      descricao: item.descricao,
      quantidade: item.quantidade,
      preco_unitario: Number(item.preco_unitario),
    })),
  }));
}

export function formStateFromOrcamento(orcamento) {
  return {
    clienteId: String(orcamento.cliente_id),
    vendedorId: orcamento.vendedor_id ? String(orcamento.vendedor_id) : '',
    status: orcamento.status,
    validadeDias: orcamento.validade_dias || 30,
    observacoes: orcamento.observacoes || '',
    formasPagamento: (orcamento.formas_pagamento || []).map((f) => ({
      id: f.id,
      nome: f.nome || '',
      desconto_percentual: Number(f.desconto_percentual) || 0,
    })),
    ambientes: mapAmbientesFromOrcamento(orcamento.ambientes || []),
  };
}

export function buildOrcamentoSnapshot({
  clienteId,
  vendedorId,
  status,
  validadeDias,
  observacoes,
  formasPagamento,
  ambientes,
}) {
  const normalized = {
    clienteId: clienteId || '',
    vendedorId: vendedorId || '',
    status,
    validadeDias: Number(validadeDias) || 30,
    observacoes: observacoes || '',
    formasPagamento: (formasPagamento || []).map((f) => ({
      id: f.id,
      nome: (f.nome || '').trim(),
      desconto_percentual: Number(f.desconto_percentual) || 0,
    })),
    ambientes: (ambientes || []).map((amb) => ({
      nome: (amb.nome || '').trim(),
      itens: (amb.itens || [])
        .filter((item) => item.descricao?.trim())
        .map((item) => ({
          produto_id: item.produto_id || null,
          descricao: item.descricao.trim(),
          quantidade: Number(item.quantidade) || 1,
          preco_unitario: Number(item.preco_unitario) || 0,
        })),
    })),
  };
  return JSON.stringify(normalized);
}

export function snapshotFromOrcamento(orcamento) {
  return buildOrcamentoSnapshot(formStateFromOrcamento(orcamento));
}
