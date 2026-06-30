const { getIdsFormaAReceber, calcularMapaAReceberPorVenda } = require('./formaPagamentoAReceber');

async function calcularMapaConsignadoNaoCobrado(db, vendaIds) {
  if (!vendaIds.length) return {};

  const result = await db.query(`
    SELECT
      venda_id,
      COUNT(*)::int AS qtd_itens,
      COALESCE(SUM(quantidade_entregue * COALESCE(preco_unitario_lista, 0)), 0) AS valor_estimado
    FROM venda_itens
    WHERE venda_id = ANY($1::int[])
      AND status = 'consignado'
      AND quantidade_entregue > 0
    GROUP BY venda_id
  `, [vendaIds]);

  const mapa = {};
  for (const row of result.rows) {
    mapa[row.venda_id] = {
      qtd_itens: row.qtd_itens,
      valor_estimado: Number(row.valor_estimado) || 0,
    };
  }
  return mapa;
}

async function enriquecerVendasComPendencias(db, vendas = []) {
  if (!vendas.length) return vendas;

  const ids = vendas.map((v) => v.id);
  const idsAReceber = await getIdsFormaAReceber(db);
  const [mapaAReceber, mapaConsignado] = await Promise.all([
    calcularMapaAReceberPorVenda(db, ids, idsAReceber),
    calcularMapaConsignadoNaoCobrado(db, ids),
  ]);

  return vendas.map((venda) => {
    const valorAReceber = mapaAReceber[venda.id] || 0;
    const consignado = mapaConsignado[venda.id];
    const qtdConsignado = consignado?.qtd_itens || 0;
    const temAReceber = valorAReceber > 0;
    const temConsignadoNaoCobrado = qtdConsignado > 0;

    return {
      ...venda,
      valor_a_receber: valorAReceber,
      tem_a_receber: temAReceber,
      qtd_consignado_nao_cobrado: qtdConsignado,
      valor_consignado_nao_cobrado: consignado?.valor_estimado || 0,
      tem_consignado_nao_cobrado: temConsignadoNaoCobrado,
      tem_pendencia: temAReceber || temConsignadoNaoCobrado,
    };
  });
}

async function enriquecerVendaComPendencias(db, venda) {
  if (!venda) return venda;
  const [enriquecida] = await enriquecerVendasComPendencias(db, [venda]);
  return enriquecida;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function mapaMetaVendas(rows = []) {
  const mapa = {};
  for (const row of rows) {
    mapa[row.id] = {
      venda_id: row.id,
      numero_pedido: row.numero_pedido,
      venda_numero: row.numero,
      cliente_nome: row.cliente_nome,
      vendedor_nome: row.vendedor_nome,
      venda_criado_em: row.criado_em,
      total: round2(row.total),
      total_pago: round2(row.total_pago),
    };
  }
  return mapa;
}

async function calcularMapaConsignadoEfetivadoSemPagamento(db, vendaIds) {
  if (!vendaIds.length) return {};

  const result = await db.query(`
    SELECT
      vi.venda_id,
      COUNT(DISTINCT vi.id)::int AS qtd_itens,
      COALESCE(SUM(vi.subtotal), 0) AS valor_itens
    FROM venda_itens vi
    JOIN venda_alteracoes va ON va.venda_item_id = vi.id AND va.tipo = 'item_efetivado'
    JOIN vendas v ON v.id = vi.venda_id
    WHERE vi.venda_id = ANY($1::int[])
      AND vi.status = 'efetivo'
      AND COALESCE(v.total_pago, 0) < COALESCE(v.total, 0)
    GROUP BY vi.venda_id
  `, [vendaIds]);

  const mapa = {};
  for (const row of result.rows) {
    mapa[row.venda_id] = {
      qtd_itens: row.qtd_itens,
      valor_estimado: round2(row.valor_itens),
    };
  }
  return mapa;
}

async function calcularMapaCustoRealPendente(db, vendaIds) {
  if (!vendaIds.length) return {};

  const result = await db.query(`
    SELECT
      venda_id,
      COUNT(*)::int AS qtd_itens,
      COALESCE(SUM(subtotal), 0) AS valor_estimado
    FROM venda_itens
    WHERE venda_id = ANY($1::int[])
      AND status = 'efetivo'
      AND (custo_unitario_real IS NULL OR custo_unitario_real <= 0)
      AND quantidade_encomenda > 0
    GROUP BY venda_id
  `, [vendaIds]);

  const mapa = {};
  for (const row of result.rows) {
    mapa[row.venda_id] = {
      qtd_itens: row.qtd_itens,
      valor_estimado: round2(row.valor_estimado),
    };
  }
  return mapa;
}

async function calcularMapaConsignadoEntregaAvulso(db, vendaIds) {
  if (!vendaIds.length) return {};

  const result = await db.query(`
    SELECT
      e.venda_id,
      COUNT(*)::int AS qtd_itens,
      COALESCE(SUM(c.quantidade), 0)::int AS qtd_unidades
    FROM entrega_itens_consignados c
    JOIN entregas e ON e.id = c.entrega_id
    WHERE e.venda_id = ANY($1::int[])
    GROUP BY e.venda_id
  `, [vendaIds]);

  const mapa = {};
  for (const row of result.rows) {
    mapa[row.venda_id] = {
      qtd_itens: row.qtd_itens,
      qtd_unidades: row.qtd_unidades,
    };
  }
  return mapa;
}

function montarItemPendencia(meta, extras = {}) {
  return {
    venda_id: meta.venda_id,
    numero_pedido: meta.numero_pedido,
    venda_numero: meta.venda_numero,
    cliente_nome: meta.cliente_nome,
    vendedor_nome: meta.vendedor_nome,
    venda_criado_em: meta.venda_criado_em,
    ...extras,
  };
}

async function listarPendenciasAnaliseVendas(db, vendaRows = []) {
  const meta = mapaMetaVendas(vendaRows);
  const vendaIds = vendaRows.map((r) => r.id);
  if (!vendaIds.length) {
    return { categorias: [], total_pendencias: 0 };
  }

  const idsAReceber = await getIdsFormaAReceber(db);
  const [
    mapaAReceber,
    mapaConsignado,
    mapaEfetivadoSemPagamento,
    mapaCustoPendente,
    mapaConsignadoEntrega,
  ] = await Promise.all([
    calcularMapaAReceberPorVenda(db, vendaIds, idsAReceber),
    calcularMapaConsignadoNaoCobrado(db, vendaIds),
    calcularMapaConsignadoEfetivadoSemPagamento(db, vendaIds),
    calcularMapaCustoRealPendente(db, vendaIds),
    calcularMapaConsignadoEntregaAvulso(db, vendaIds),
  ]);

  const itensAReceber = [];
  const itensConsignadoDecisao = [];
  const itensEfetivadoSemPagamento = [];
  const itensPagamentoInsuficiente = [];
  const itensCustoPendente = [];
  const itensConsignadoEntrega = [];

  for (const row of vendaRows) {
    const m = meta[row.id];
    const valorAReceber = mapaAReceber[row.id] || 0;
    const consignado = mapaConsignado[row.id];
    const efetivado = mapaEfetivadoSemPagamento[row.id];
    const custoPend = mapaCustoPendente[row.id];
    const consignadoEntrega = mapaConsignadoEntrega[row.id];
    const gapPagamento = round2((m.total || 0) - (m.total_pago || 0));
    const gapSemAReceber = round2(gapPagamento - valorAReceber);

    if (valorAReceber > 0) {
      itensAReceber.push(montarItemPendencia(m, {
        tipo: 'pagamento_a_receber',
        valor: valorAReceber,
        detalhe: 'Forma de pagamento "A receber" cadastrada',
      }));
    }

    if (consignado?.qtd_itens > 0) {
      itensConsignadoDecisao.push(montarItemPendencia(m, {
        tipo: 'consignado_aguardando_decisao',
        qtd_itens: consignado.qtd_itens,
        valor: consignado.valor_estimado,
        detalhe: 'Produto consignado entregue — confirme se o cliente ficou com o item',
      }));
    }

    if (efetivado?.qtd_itens > 0) {
      itensEfetivadoSemPagamento.push(montarItemPendencia(m, {
        tipo: 'consignado_efetivado_sem_pagamento',
        qtd_itens: efetivado.qtd_itens,
        valor: efetivado.valor_estimado,
        detalhe: 'Item consignado efetivado, mas o pedido ainda não está totalmente pago',
      }));
    }

    if (gapSemAReceber > 0.01 && valorAReceber <= 0) {
      itensPagamentoInsuficiente.push(montarItemPendencia(m, {
        tipo: 'pagamento_insuficiente',
        valor: gapSemAReceber,
        detalhe: `Faltam ${gapSemAReceber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para cobrir o total do pedido`,
      }));
    }

    if (custoPend?.qtd_itens > 0) {
      itensCustoPendente.push(montarItemPendencia(m, {
        tipo: 'custo_real_pendente',
        qtd_itens: custoPend.qtd_itens,
        valor: custoPend.valor_estimado,
        detalhe: 'Itens de encomenda sem custo real (NF ainda não recebida)',
      }));
    }

    if (consignadoEntrega?.qtd_itens > 0) {
      itensConsignadoEntrega.push(montarItemPendencia(m, {
        tipo: 'consignado_entrega_avulsa',
        qtd_itens: consignadoEntrega.qtd_itens,
        qtd_unidades: consignadoEntrega.qtd_unidades,
        detalhe: 'Produtos consignados registrados na entrega aguardam definição',
      }));
    }
  }

  const sortPorData = (a, b) => new Date(b.venda_criado_em) - new Date(a.venda_criado_em);
  const categorias = [
    {
      id: 'pagamento_a_receber',
      titulo: 'Pagamento a receber',
      descricao: 'Pedidos com forma de pagamento "A receber" cadastrada',
      itens: itensAReceber.sort(sortPorData),
    },
    {
      id: 'consignado_aguardando_decisao',
      titulo: 'Consignado — aguardando decisão',
      descricao: 'Itens consignados já entregues; confirme se o cliente ficou com o produto',
      itens: itensConsignadoDecisao.sort(sortPorData),
    },
    {
      id: 'consignado_efetivado_sem_pagamento',
      titulo: 'Consignado efetivado sem cobrança',
      descricao: 'Itens efetivados após consignação, mas pagamento do pedido incompleto',
      itens: itensEfetivadoSemPagamento.sort(sortPorData),
    },
    {
      id: 'pagamento_insuficiente',
      titulo: 'Pagamento incompleto',
      descricao: 'Total do pedido não coberto pelos pagamentos registrados',
      itens: itensPagamentoInsuficiente.sort(sortPorData),
    },
    {
      id: 'custo_real_pendente',
      titulo: 'Custo real pendente',
      descricao: 'Itens de encomenda aguardando recebimento/NF para calcular markup',
      itens: itensCustoPendente.sort(sortPorData),
    },
    {
      id: 'consignado_entrega_avulsa',
      titulo: 'Consignado na entrega',
      descricao: 'Produtos consignados adicionados na entrega ainda não resolvidos',
      itens: itensConsignadoEntrega.sort(sortPorData),
    },
  ].filter((cat) => cat.itens.length > 0);

  const totalPendencias = categorias.reduce((sum, cat) => sum + cat.itens.length, 0);

  return { categorias, total_pendencias: totalPendencias };
}

module.exports = {
  calcularMapaConsignadoNaoCobrado,
  enriquecerVendasComPendencias,
  enriquecerVendaComPendencias,
  listarPendenciasAnaliseVendas,
};
