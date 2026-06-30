export function mapAmbientesFromPlanejado(ambientes = []) {
  return ambientes.map((ambiente) => ({
    nome: ambiente.nome,
    itens: ambiente.itens.map((item) => ({
      descricao: item.descricao || '',
      produto_planejado_id: item.produto_planejado_id ? String(item.produto_planejado_id) : '',
      largura: item.largura ?? '',
      profundidade: item.profundidade ?? '',
      altura: item.altura ?? '',
      espessura_mdf: item.espessura_mdf ?? 18,
      padrao_mdf: item.padrao_mdf || '',
      tipo_fundo: item.tipo_fundo || 'fino',
      tipo_porta: item.tipo_porta || 'sem_porta',
      tipo_puxador: item.tipo_puxador || 'sem_puxador',
      tipo_puxador_outro: item.tipo_puxador_outro || '',
      cor_puxador: item.cor_puxador || '',
      tipo_corredicas: item.tipo_corredicas || 'sem_corredicas',
      canaleta_led: Boolean(item.canaleta_led),
      itens_extra: item.itens_extra || '',
      quantidade: item.quantidade ?? 1,
      preco_unitario: Number(item.preco_unitario) || 0,
    })),
  }));
}

export function formStateFromPlanejado(orcamento) {
  return {
    clienteId: String(orcamento.cliente_id),
    vendedorId: orcamento.vendedor_id ? String(orcamento.vendedor_id) : '',
    status: orcamento.status || 'rascunho',
    validadeDias: orcamento.validade_dias || 30,
    prazoEntrega: orcamento.prazo_entrega_outro ? 'outro' : String(orcamento.prazo_entrega_dias || 60),
    prazoEntregaOutro: orcamento.prazo_entrega_outro || '',
    observacoes: orcamento.observacoes || '',
    formasPagamento: orcamento.formas_pagamento || [],
    ambientes: mapAmbientesFromPlanejado(orcamento.ambientes || []),
  };
}

export function buildOrcamentoPlanejadoSnapshot(state) {
  return JSON.stringify({
    clienteId: state.clienteId || '',
    vendedorId: state.vendedorId || '',
    status: state.status || 'rascunho',
    validadeDias: Number(state.validadeDias) || 30,
    prazoEntrega: state.prazoEntrega || '60',
    prazoEntregaOutro: state.prazoEntregaOutro || '',
    observacoes: state.observacoes || '',
    formasPagamento: (state.formasPagamento || []).map((f) => ({
      id: f.id,
      nome: f.nome,
      desconto_percentual: Number(f.desconto_percentual) || 0,
    })),
    ambientes: (state.ambientes || []).map((ambiente) => ({
      nome: ambiente.nome || '',
      itens: (ambiente.itens || []).map((item) => ({
        produto_planejado_id: item.produto_planejado_id || '',
        descricao: item.descricao || '',
        largura: item.largura ?? '',
        profundidade: item.profundidade ?? '',
        altura: item.altura ?? '',
        espessura_mdf: Number(item.espessura_mdf) || 18,
        padrao_mdf: item.padrao_mdf || '',
        tipo_fundo: item.tipo_fundo || 'fino',
        tipo_porta: item.tipo_porta || 'sem_porta',
        tipo_puxador: item.tipo_puxador || 'sem_puxador',
        tipo_puxador_outro: item.tipo_puxador_outro || '',
        cor_puxador: item.cor_puxador || '',
        tipo_corredicas: item.tipo_corredicas || 'sem_corredicas',
        canaleta_led: Boolean(item.canaleta_led),
        itens_extra: item.itens_extra || '',
        quantidade: Number(item.quantidade) || 1,
        preco_unitario: Number(item.preco_unitario) || 0,
      })),
    })),
  });
}

export function snapshotFromPlanejado(orcamento) {
  return buildOrcamentoPlanejadoSnapshot(formStateFromPlanejado(orcamento));
}
