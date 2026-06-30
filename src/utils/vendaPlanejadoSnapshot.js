import { mapAmbientesFromPlanejado } from './orcamentoPlanejadoSnapshot';

export function mapAnexosFromApi(anexos = []) {
  return anexos.map((a) => ({
    id: a.id,
    nome_original: a.nome_original,
    tamanho_bytes: a.tamanho_bytes,
    mime_type: a.mime_type,
  }));
}

export function formStateFromVendaPlanejado(venda) {
  return {
    clienteId: String(venda.cliente_id),
    vendedorId: venda.vendedor_id ? String(venda.vendedor_id) : '',
    orcamentoPlanejadoId: venda.orcamento_planejado_id ? String(venda.orcamento_planejado_id) : '',
    numeroPedido: venda.numero_pedido || '',
    prazoEntrega: venda.prazo_entrega_outro ? 'outro' : String(venda.prazo_entrega_dias || 60),
    prazoEntregaOutro: venda.prazo_entrega_outro || '',
    observacoes: venda.observacoes || '',
    medidasConferidas: Boolean(venda.medidas_conferidas),
    responsavelMedidas: venda.responsavel_medidas || '',
    pagamentos: (venda.pagamentos || []).map((p) => ({
      id: p.id,
      forma_pagamento_id: p.forma_pagamento_id ? String(p.forma_pagamento_id) : '',
      valor: Number(p.valor) || 0,
      parcelas: Number(p.parcelas) || 1,
      observacao: p.observacao || '',
    })),
    ambientes: mapAmbientesFromPlanejado(venda.ambientes || []),
    anexos: mapAnexosFromApi(venda.anexos || []),
  };
}

export function buildVendaPlanejadoSnapshot(state) {
  return JSON.stringify({
    clienteId: state.clienteId || '',
    vendedorId: state.vendedorId || '',
    orcamentoPlanejadoId: state.orcamentoPlanejadoId || '',
    numeroPedido: state.numeroPedido || '',
    prazoEntrega: state.prazoEntrega || '60',
    prazoEntregaOutro: state.prazoEntregaOutro || '',
    observacoes: state.observacoes || '',
    medidasConferidas: Boolean(state.medidasConferidas),
    responsavelMedidas: state.responsavelMedidas || '',
    pagamentos: (state.pagamentos || []).map((p) => ({
      id: p.id,
      forma_pagamento_id: p.forma_pagamento_id || '',
      valor: Number(p.valor) || 0,
      parcelas: Number(p.parcelas) || 1,
      observacao: p.observacao || '',
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
    anexos: (state.anexos || []).map((a) => ({
      id: a.id || null,
      nome_original: a.nome_original || '',
      remover: Boolean(a.remover),
      pending: Boolean(a.pending),
    })),
  });
}

export function snapshotFromVendaPlanejado(venda) {
  return buildVendaPlanejadoSnapshot(formStateFromVendaPlanejado(venda));
}
