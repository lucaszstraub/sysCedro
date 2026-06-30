const { getPool } = require('./database');
const { fetchIncentivoParceiroPorVenda } = require('./incentivosParceiro');
const {
  getIdsFormaAReceber,
  calcularMapaAReceberPorVenda,
} = require('./formaPagamentoAReceber');
const { listarPendenciasAnaliseVendas } = require('./vendaPendencias');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function montarPedidosAReceber(produtos, mapaAReceber) {
  const pedidos = [];
  for (const [vendaId, valor] of Object.entries(mapaAReceber)) {
    const amostra = produtos.find((p) => p.venda_id === Number(vendaId));
    if (!amostra) continue;
    pedidos.push({
      venda_id: Number(vendaId),
      valor_a_receber: valor,
      numero_pedido: amostra.numero_pedido,
      venda_numero: amostra.venda_numero,
      cliente_nome: amostra.cliente_nome,
      vendedor_nome: amostra.vendedor_nome,
      venda_criado_em: amostra.venda_criado_em,
      tem_alteracao_pos_venda: amostra.tem_alteracao_pos_venda,
      nota_alteracao: amostra.nota_alteracao,
    });
  }
  return pedidos.sort(
    (a, b) => new Date(b.venda_criado_em) - new Date(a.venda_criado_em)
  );
}

function normalizarFiltros(filtros = {}) {
  if (typeof filtros === 'string') {
    return { busca: filtros };
  }
  return filtros || {};
}

function buildFiltrosVendas(filtros = {}) {
  const f = normalizarFiltros(filtros);
  const params = [];
  const where = [
    "v.status IN ('confirmada', 'entregue')",
    'COALESCE(v.desativada, false) = false',
  ];

  const busca = String(f.busca || '').trim();
  if (busca) {
    params.push(`%${busca}%`);
    const idx = params.length;
    where.push(`(
      v.numero ILIKE $${idx}
      OR v.numero_pedido ILIKE $${idx}
      OR c.nome ILIKE $${idx}
      OR vd.nome ILIKE $${idx}
      OR vi.descricao ILIKE $${idx}
      OR COALESCE(p.sku, '') ILIKE $${idx}
    )`);
  }

  const vendedorId = f.vendedorId ? Number(f.vendedorId) : null;
  if (vendedorId) {
    params.push(vendedorId);
    where.push(`v.vendedor_id = $${params.length}`);
  }

  if (f.dataInicio) {
    params.push(f.dataInicio);
    where.push(`v.criado_em::date >= $${params.length}::date`);
  }

  if (f.dataFim) {
    params.push(f.dataFim);
    where.push(`v.criado_em::date <= $${params.length}::date`);
  }

  return { params, whereClause: where.join(' AND ') };
}

function calcularMarkupReal(receitaLiquida, custoRealTotal) {
  const receita = Number(receitaLiquida) || 0;
  const custo = Number(custoRealTotal) || 0;
  if (receita <= 0 || custo <= 0) return null;
  return round4(receita / custo);
}

function calcularMargemPercent(receita, custo) {
  const r = Number(receita) || 0;
  const c = Number(custo) || 0;
  if (r <= 0) return null;
  return round2(((r - c) / r) * 100);
}

/**
 * Receita do item já considera desconto final da venda (subtotal com preço efetivo).
 * Deduz incentivo a parceiro proporcional ao item.
 */
function calcularMetricasItemProduto(row) {
  const quantidade = Number(row.quantidade) || 0;
  const subtotal = round2(row.subtotal);
  const precoLista = Number(row.preco_unitario_lista ?? row.preco_unitario) || 0;
  const receitaLista = round2(precoLista * quantidade);
  const descontoVenda = round2(Math.max(receitaLista - subtotal, 0));
  const incentivoDeducao = round2(row.incentivo_deducao || 0);
  const receitaLiquidaReal = round2(subtotal - incentivoDeducao);

  const custoRealTotal = row.custo_unitario_real != null
    ? round2((Number(row.custo_unitario_real) || 0) * quantidade)
    : null;

  const markupReal = custoRealTotal > 0
    ? calcularMarkupReal(receitaLiquidaReal, custoRealTotal)
    : null;

  return {
    receita_lista: receitaLista,
    receita_efetiva: subtotal,
    desconto_venda: descontoVenda,
    incentivo_deducao: incentivoDeducao,
    receita_liquida_real: receitaLiquidaReal,
    custo_real_total: custoRealTotal,
    markup_real: markupReal,
    margem_real_pct: custoRealTotal > 0
      ? calcularMargemPercent(receitaLiquidaReal, custoRealTotal)
      : null,
    tem_custo_real: custoRealTotal != null && custoRealTotal > 0,
  };
}

function passesMarkupFiltroPedido(markupPedido, filtros) {
  const f = normalizarFiltros(filtros);
  const raw = f.markupMinimo;
  if (raw === '' || raw == null || Number.isNaN(Number(raw))) return true;
  if (markupPedido == null) return false;

  const limite = Number(raw);
  const modo = f.markupFiltro === 'abaixo' ? 'abaixo' : 'acima';
  if (modo === 'abaixo') return markupPedido < limite;
  return markupPedido >= limite;
}

function agruparPedidosPorVenda(produtos, mapaRt = {}) {
  const map = new Map();

  for (const p of produtos) {
    let ped = map.get(p.venda_id);
    if (!ped) {
      ped = {
        venda_id: p.venda_id,
        numero_pedido: p.numero_pedido,
        venda_numero: p.venda_numero,
        venda_criado_em: p.venda_criado_em,
        cliente_nome: p.cliente_nome,
        vendedor_nome: p.vendedor_nome,
        vendedor_id: p.vendedor_id,
        tem_alteracao_pos_venda: p.tem_alteracao_pos_venda,
        nota_alteracao: p.nota_alteracao,
        qtd_itens: 0,
        valor_total: 0,
        receita_liquida: 0,
        custo_real: 0,
        produtos_sem_custo: 0,
        rt: round2(mapaRt[p.venda_id] || 0),
      };
      map.set(p.venda_id, ped);
    }
    ped.qtd_itens += p.quantidade;
    ped.valor_total = round2(ped.valor_total + p.receita_efetiva);
    ped.receita_liquida = round2(ped.receita_liquida + p.receita_liquida_real);
    if (p.tem_custo_real) {
      ped.custo_real = round2(ped.custo_real + p.custo_real_total);
    } else {
      ped.produtos_sem_custo += 1;
    }
  }

  const pedidos = [];
  for (const ped of map.values()) {
    ped.markup_pedido = ped.custo_real > 0
      ? calcularMarkupReal(ped.receita_liquida, ped.custo_real)
      : null;
    pedidos.push(ped);
  }

  return pedidos.sort((a, b) => new Date(b.venda_criado_em) - new Date(a.venda_criado_em));
}

function calcularResumoPedidos(pedidos, filtros) {
  const filtrados = pedidos.filter((p) => passesMarkupFiltroPedido(p.markup_pedido, filtros));
  const numeroVendas = filtrados.length;
  const valorTotalVendas = round2(filtrados.reduce((s, p) => s + p.valor_total, 0));
  const custoTotal = round2(filtrados.reduce((s, p) => s + p.custo_real, 0));
  const receitaLiquida = round2(filtrados.reduce((s, p) => s + p.receita_liquida, 0));
  const markupConsolidado = calcularMarkupReal(receitaLiquida, custoTotal);
  const ticketMedio = numeroVendas > 0 ? round2(valorTotalVendas / numeroVendas) : 0;
  const rtTotal = round2(filtrados.reduce((s, p) => s + (p.rt || 0), 0));

  const f = normalizarFiltros(filtros);
  const filtroAtivo = f.markupMinimo !== '' && f.markupMinimo != null && !Number.isNaN(Number(f.markupMinimo));

  return {
    numero_vendas: numeroVendas,
    valor_total_vendas: valorTotalVendas,
    custo_total: custoTotal,
    markup: markupConsolidado,
    ticket_medio: ticketMedio,
    rt_total: rtTotal,
    receita_liquida_real: receitaLiquida,
    filtro_markup_ativo: filtroAtivo,
    filtro_markup_valor: filtroAtivo ? Number(f.markupMinimo) : null,
    filtro_markup_modo: filtroAtivo ? (f.markupFiltro === 'abaixo' ? 'abaixo' : 'acima') : null,
    // compatibilidade
    total_vendas: numeroVendas,
    markup_real_consolidado: markupConsolidado,
    custo_real_total: custoTotal,
    markup_medio_real: null,
  };
}

async function listarVendasNoEscopo(filtros = {}) {
  const db = getPool();
  const { params, whereClause } = buildFiltrosVendas(filtros);

  const result = await db.query(`
    SELECT DISTINCT
      v.id,
      v.numero,
      v.numero_pedido,
      v.criado_em,
      v.total,
      v.total_pago,
      c.nome AS cliente_nome,
      vd.nome AS vendedor_nome
    FROM vendas v
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    JOIN venda_itens vi ON vi.venda_id = v.id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE ${whereClause}
    ORDER BY v.criado_em DESC
  `, params);

  return result.rows;
}

async function calcularMapaRtPorVenda(db, vendaIds) {
  if (!vendaIds.length) return {};

  const result = await db.query(`
    SELECT venda_id, COALESCE(valor_comissao, 0) AS rt
    FROM venda_incentivos_parceiro
    WHERE venda_id = ANY($1::int[])
  `, [vendaIds]);

  const mapa = {};
  for (const row of result.rows) {
    mapa[row.venda_id] = round2(row.rt);
  }
  return mapa;
}
function passesMarkupFiltro(markupReal, filtros) {
  const f = normalizarFiltros(filtros);
  const raw = f.markupMinimo;
  if (raw === '' || raw == null || Number.isNaN(Number(raw))) return true;
  if (markupReal == null) return false;

  const limite = Number(raw);
  const modo = f.markupFiltro === 'abaixo' ? 'abaixo' : 'acima';
  if (modo === 'abaixo') return markupReal < limite;
  return markupReal >= limite;
}

function calcularResumoProdutos(produtos, filtros) {
  const comCustoReal = produtos.filter((p) => p.tem_custo_real);
  const receitaLiquida = round2(comCustoReal.reduce((s, p) => s + p.receita_liquida_real, 0));
  const custoReal = round2(comCustoReal.reduce((s, p) => s + p.custo_real_total, 0));
  const markups = comCustoReal.map((p) => p.markup_real).filter((m) => m != null);
  const vendasDistintas = new Set(produtos.map((p) => p.venda_id));

  const markupRealConsolidado = calcularMarkupReal(receitaLiquida, custoReal);
  const markupMedioReal = markups.length > 0
    ? round4(markups.reduce((s, m) => s + m, 0) / markups.length)
    : null;

  const f = normalizarFiltros(filtros);
  const filtroAtivo = f.markupMinimo !== '' && f.markupMinimo != null && !Number.isNaN(Number(f.markupMinimo));

  return {
    total_vendas: vendasDistintas.size,
    total_produtos: produtos.length,
    produtos_com_custo_real: comCustoReal.length,
    produtos_sem_custo_real: produtos.length - comCustoReal.length,
    receita_liquida_real: receitaLiquida,
    custo_real_total: custoReal,
    incentivos_total: round2(produtos.reduce((s, p) => s + p.incentivo_deducao, 0)),
    markup_real_consolidado: markupRealConsolidado,
    markup_medio_real: markupMedioReal,
    margem_real_pct: calcularMargemPercent(receitaLiquida, custoReal),
    filtro_markup_ativo: filtroAtivo,
    filtro_markup_valor: filtroAtivo ? Number(f.markupMinimo) : null,
    filtro_markup_modo: filtroAtivo ? (f.markupFiltro === 'abaixo' ? 'abaixo' : 'acima') : null,
  };
}

async function listarProdutosAnalise(filtros = {}) {
  const db = getPool();
  const { params, whereClause } = buildFiltrosVendas(filtros);

  const result = await db.query(`
    SELECT
      vi.id AS venda_item_id,
      vi.venda_id,
      vi.produto_id,
      vi.descricao,
      vi.quantidade,
      vi.quantidade_estoque,
      vi.quantidade_encomenda,
      vi.subtotal,
      vi.preco_unitario,
      vi.preco_unitario_lista,
      vi.custo_unitario_real,
      v.numero,
      v.numero_pedido,
      v.criado_em,
      v.tem_alteracao_pos_venda,
      v.nota_alteracao,
      c.nome AS cliente_nome,
      vd.nome AS vendedor_nome,
      vd.id AS vendedor_id,
      p.sku AS produto_sku,
      COALESCE(vii.valor_deducao, 0) AS incentivo_deducao
    FROM venda_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN venda_incentivos_parceiro vip ON vip.venda_id = v.id
    LEFT JOIN venda_incentivo_parceiro_itens vii
      ON vii.incentivo_id = vip.id AND vii.venda_item_id = vi.id
    WHERE ${whereClause}
      AND vi.status = 'efetivo'
    ORDER BY v.criado_em DESC, vi.id
    LIMIT 2000
  `, params);

  const todos = result.rows.map((row) => {
    const quantidade = Number(row.quantidade) || 0;
    const metricas = calcularMetricasItemProduto(row);
    return {
      venda_item_id: row.venda_item_id,
      venda_id: row.venda_id,
      descricao: row.descricao,
      produto_sku: row.produto_sku,
      produto_id: row.produto_id,
      quantidade,
      quantidade_estoque: Number(row.quantidade_estoque) || 0,
      quantidade_encomenda: Number(row.quantidade_encomenda) || 0,
      preco_unitario: round2(row.preco_unitario),
      preco_unitario_lista: row.preco_unitario_lista != null ? round2(row.preco_unitario_lista) : null,
      venda_numero: row.numero,
      numero_pedido: row.numero_pedido,
      venda_criado_em: row.criado_em,
      tem_alteracao_pos_venda: row.tem_alteracao_pos_venda,
      nota_alteracao: row.nota_alteracao,
      cliente_nome: row.cliente_nome,
      vendedor_nome: row.vendedor_nome,
      vendedor_id: row.vendedor_id,
      custo_unitario_real: row.custo_unitario_real != null
        ? round2(row.custo_unitario_real)
        : null,
      ...metricas,
    };
  });

  const produtos = todos.filter((p) => passesMarkupFiltro(p.markup_real, filtros));
  return { todos, produtos };
}

async function getVisaoGeralVendas(filtros = {}) {
  const db = getPool();
  const { todos: produtosBase } = await listarProdutosAnalise(filtros);
  const vendasEscopo = await listarVendasNoEscopo(filtros);
  const vendaIds = vendasEscopo.map((v) => v.id);

  const mapaRt = await calcularMapaRtPorVenda(db, vendaIds);
  const pedidosTodos = agruparPedidosPorVenda(produtosBase, mapaRt);
  const pedidos = pedidosTodos.filter((p) => passesMarkupFiltroPedido(p.markup_pedido, filtros));
  const resumo = calcularResumoPedidos(pedidosTodos, filtros);

  const idsAReceber = await getIdsFormaAReceber(db);
  const mapaAReceber = await calcularMapaAReceberPorVenda(db, vendaIds, idsAReceber);
  const pendencias = await listarPendenciasAnaliseVendas(db, vendasEscopo);

  const pedidosEnriquecidos = pedidos.map((ped) => ({
    ...ped,
    valor_a_receber: mapaAReceber[ped.venda_id] || 0,
    tem_a_receber: (mapaAReceber[ped.venda_id] || 0) > 0,
    tem_pendencia: pendencias.categorias.some((cat) => (
      cat.itens.some((item) => item.venda_id === ped.venda_id)
    )),
  }));

  const pedidosAReceber = montarPedidosAReceber(produtosBase, mapaAReceber);
  const totalAReceber = round2(
    pedidosAReceber.reduce((sum, p) => sum + p.valor_a_receber, 0)
  );

  return {
    resumo: {
      ...resumo,
      total_a_receber: totalAReceber,
      qtd_pedidos_a_receber: pedidosAReceber.length,
      total_pendencias: pendencias.total_pendencias,
    },
    pedidos: pedidosEnriquecidos,
    pendencias,
    produtos: produtosBase.filter((p) => passesMarkupFiltro(p.markup_real, filtros)),
    pedidos_a_receber: pedidosAReceber,
  };
}

async function getVendaAnaliseMarkup(vendaId) {
  const db = getPool();
  const venda = await db.query(`
    SELECT v.*, c.nome AS cliente_nome, vd.nome AS vendedor_nome
    FROM vendas v
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE v.id = $1
  `, [vendaId]);

  if (venda.rowCount === 0) return null;

  const itens = await db.query(`
    SELECT
      vi.id AS venda_item_id,
      vi.*,
      p.sku AS produto_sku,
      COALESCE(vii.valor_deducao, 0) AS incentivo_deducao,
      (
        SELECT COALESCE(SUM(ac.valor_ajuste), 0)
        FROM ajustes_comissao ac
        WHERE ac.venda_item_id = vi.id AND ac.status = 'pendente'
      ) AS ajuste_comissao_pendente
    FROM venda_itens vi
    LEFT JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN venda_incentivos_parceiro vip ON vip.venda_id = vi.venda_id
    LEFT JOIN venda_incentivo_parceiro_itens vii
      ON vii.incentivo_id = vip.id AND vii.venda_item_id = vi.id
    WHERE vi.venda_id = $1
    ORDER BY vi.id
  `, [vendaId]);

  const ajustes = await db.query(`
    SELECT ac.*, vi.descricao AS item_descricao
    FROM ajustes_comissao ac
    JOIN venda_itens vi ON vi.id = ac.venda_item_id
    WHERE ac.venda_id = $1
    ORDER BY ac.criado_em DESC
  `, [vendaId]);

  const incentivo = await fetchIncentivoParceiroPorVenda(vendaId);

  const idsAReceber = await getIdsFormaAReceber(db);
  const mapaAReceber = await calcularMapaAReceberPorVenda(db, [vendaId], idsAReceber);
  const valorAReceber = mapaAReceber[vendaId] || 0;

  const rtResult = await db.query(
    'SELECT COALESCE(valor_comissao, 0) AS rt FROM venda_incentivos_parceiro WHERE venda_id = $1',
    [vendaId]
  );
  const rt = round2(rtResult.rows[0]?.rt || 0);

  const itensMapeados = itens.rows
    .filter((row) => row.status === 'efetivo')
    .map((row) => ({
      ...row,
      ...calcularMetricasItemProduto(row),
    }));

  const consolidado = calcularResumoProdutos(itensMapeados, {});
  const pedidoResumo = agruparPedidosPorVenda(
    itensMapeados.map((item) => ({
      venda_id: vendaId,
      quantidade: item.quantidade,
      receita_efetiva: item.receita_efetiva,
      receita_liquida_real: item.receita_liquida_real,
      custo_real_total: item.custo_real_total,
      tem_custo_real: item.tem_custo_real,
      numero_pedido: venda.rows[0].numero_pedido,
      venda_numero: venda.rows[0].numero,
      venda_criado_em: venda.rows[0].criado_em,
      cliente_nome: venda.rows[0].cliente_nome,
      vendedor_nome: venda.rows[0].vendedor_nome,
      vendedor_id: venda.rows[0].vendedor_id,
      tem_alteracao_pos_venda: venda.rows[0].tem_alteracao_pos_venda,
      nota_alteracao: venda.rows[0].nota_alteracao,
    })),
    { [vendaId]: rt }
  )[0] || null;

  return {
    venda: {
      ...venda.rows[0],
      valor_a_receber: valorAReceber,
      tem_a_receber: valorAReceber > 0,
      rt,
    },
    pedido: pedidoResumo,
    itens: itensMapeados,
    ajustes: ajustes.rows,
    incentivo_parceiro: incentivo,
    consolidado,
  };
}

async function listAjustesComissao(filtros = {}) {
  const db = getPool();
  const { params, whereClause } = buildFiltrosVendas(filtros);
  const whereAjustes = whereClause.replace(/\bv\./g, 've.').replace(/\bvi\./g, 'vit.');

  const result = await db.query(`
    SELECT
      ac.*,
      v.nome AS vendedor_nome,
      ve.numero AS venda_numero,
      ve.numero_pedido,
      vit.descricao AS item_descricao,
      c.nome AS cliente_nome
    FROM ajustes_comissao ac
    JOIN vendedores v ON v.id = ac.vendedor_id
    JOIN vendas ve ON ve.id = ac.venda_id
    JOIN venda_itens vit ON vit.id = ac.venda_item_id
    JOIN clientes c ON c.id = ve.cliente_id
    LEFT JOIN vendedores vd ON vd.id = ve.vendedor_id
    LEFT JOIN produtos p ON p.id = vit.produto_id
    WHERE ac.status = 'pendente'
      AND ${whereAjustes}
    ORDER BY ac.criado_em DESC
    LIMIT 200
  `, params);
  return result.rows;
}

module.exports = {
  getVisaoGeralVendas,
  getVendaAnaliseMarkup,
  listAjustesComissao,
  calcularMetricasItemProduto,
  calcularMarkupReal,
  passesMarkupFiltro,
  passesMarkupFiltroPedido,
  agruparPedidosPorVenda,
};
