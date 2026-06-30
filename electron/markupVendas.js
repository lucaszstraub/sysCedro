function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function calcularMarkup(precoVenda, custoUnitario) {
  const custo = Number(custoUnitario) || 0;
  const preco = Number(precoVenda) || 0;
  if (custo <= 0 || preco <= 0) return null;
  return round4(preco / custo);
}

function calcularCustoUnitarioEsperado(qtd, qtdEstoque, custoEstoque, qtdEncomenda, custoEncomenda) {
  const quantidade = Number(qtd) || 0;
  if (quantidade <= 0) return 0;
  const total = (Number(qtdEstoque) || 0) * (Number(custoEstoque) || 0)
    + (Number(qtdEncomenda) || 0) * (Number(custoEncomenda) || 0);
  return round2(total / quantidade);
}

function recalcularCustoRealEMarkup(item) {
  const quantidade = Number(item.quantidade) || 0;
  const qE = Number(item.quantidade_estoque) || 0;
  const qEnc = Number(item.quantidade_encomenda) || 0;
  const qRec = Number(item.quantidade_encomenda_recebida) || 0;
  const cE = Number(item.custo_estoque_unitario) || 0;
  const cEncEsp = Number(item.custo_encomenda_unitario) || 0;
  const cEncRealSum = Number(item.custo_encomenda_real_acumulado) || 0;
  const preco = Number(item.preco_unitario) || 0;

  if (quantidade <= 0) {
    return { custo_unitario_real: 0, markup_real: null };
  }

  const qEncPend = Math.max(qEnc - qRec, 0);
  const cEncAvg = qRec > 0 ? cEncRealSum / qRec : cEncEsp;
  const custoTotal = (cE * qE) + (cEncAvg * qRec) + (cEncEsp * qEncPend);
  const custoUnitarioReal = round2(custoTotal / quantidade);
  const markupReal = calcularMarkup(preco, custoUnitarioReal);

  return {
    custo_unitario_real: custoUnitarioReal,
    markup_real: markupReal,
  };
}

async function obterCustoEncomendaVendaItem(client, vendaItemId, produtoId) {
  const enc = await client.query(`
    SELECT custo_com_impostos, custo_negociado, ef.frete_percentual, ef.ipi_percentual
    FROM encomenda_fornecedor_itens ei
    JOIN encomendas_fornecedor ef ON ef.id = ei.encomenda_id
    WHERE ei.venda_item_id = $1 AND ei.status != 'cancelado'
    ORDER BY ei.id DESC
    LIMIT 1
  `, [vendaItemId]);

  if (enc.rowCount > 0) {
    const row = enc.rows[0];
    const comImpostos = Number(row.custo_com_impostos);
    if (comImpostos > 0) return comImpostos;
    const neg = Number(row.custo_negociado) || 0;
    const fretePct = Number(row.frete_percentual ?? 10);
    const ipiPct = Number(row.ipi_percentual ?? 3.25);
    return round2(neg + (neg * fretePct / 100) + (neg * ipiPct / 100));
  }

  if (produtoId) {
    const prod = await client.query('SELECT preco_custo FROM produtos WHERE id = $1', [produtoId]);
    return Number(prod.rows[0]?.preco_custo) || 0;
  }
  return 0;
}

function resolverCustoEstoqueCongelado(item, produtoPrecoCusto, preservarCustoEstoque) {
  const qtdEstoque = Number(item.quantidade_estoque) || 0;
  const custoSalvo = Number(item.custo_estoque_unitario) || 0;

  if (qtdEstoque <= 0) {
    return custoSalvo;
  }

  if (preservarCustoEstoque && custoSalvo > 0) {
    return custoSalvo;
  }

  return Number(produtoPrecoCusto) || 0;
}

function resolverCustosReais(item, {
  custoEstoque,
  custoEncomenda,
  custoUnitarioEsperado,
  markupEsperado,
  preservarEstadoRecebimento,
}) {
  const qtdEncomenda = Number(item.quantidade_encomenda) || 0;
  const qtdRecebida = preservarEstadoRecebimento
    ? (Number(item.quantidade_encomenda_recebida) || 0)
    : 0;
  const somenteEstoque = qtdEncomenda === 0;

  if (somenteEstoque) {
    return {
      custo_unitario_real: custoUnitarioEsperado,
      markup_real: markupEsperado,
      custo_encomenda_real_acumulado: 0,
      quantidade_encomenda_recebida: 0,
      custo_extra_acumulado: 0,
    };
  }

  if (qtdRecebida > 0) {
    const itemAtualizado = {
      ...item,
      custo_estoque_unitario: custoEstoque,
      custo_encomenda_unitario: custoEncomenda,
      custo_encomenda_real_acumulado: Number(item.custo_encomenda_real_acumulado) || 0,
      quantidade_encomenda_recebida: qtdRecebida,
      custo_extra_acumulado: Number(item.custo_extra_acumulado) || 0,
    };
    const { custo_unitario_real, markup_real } = recalcularCustoRealEMarkup(itemAtualizado);
    return {
      custo_unitario_real,
      markup_real,
      custo_encomenda_real_acumulado: itemAtualizado.custo_encomenda_real_acumulado,
      quantidade_encomenda_recebida: itemAtualizado.quantidade_encomenda_recebida,
      custo_extra_acumulado: itemAtualizado.custo_extra_acumulado,
    };
  }

  return {
    custo_unitario_real: custoUnitarioEsperado,
    markup_real: null,
    custo_encomenda_real_acumulado: 0,
    quantidade_encomenda_recebida: 0,
    custo_extra_acumulado: 0,
  };
}

async function aplicarCustosMarkupVendaItem(client, vendaItemId, options = {}) {
  const {
    preservarCustoEstoque = false,
    preservarEstadoRecebimento = false,
  } = options;

  const result = await client.query(`
    SELECT vi.*, p.preco_custo AS produto_preco_custo
    FROM venda_itens vi
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE vi.id = $1
  `, [vendaItemId]);

  if (result.rowCount === 0) return null;
  const item = result.rows[0];

  const qtdEncomenda = Number(item.quantidade_encomenda) || 0;
  const custoEstoque = resolverCustoEstoqueCongelado(
    item,
    item.produto_preco_custo,
    preservarCustoEstoque
  );
  const custoEncomenda = qtdEncomenda > 0
    ? await obterCustoEncomendaVendaItem(client, vendaItemId, item.produto_id)
    : 0;

  const custoUnitarioEsperado = calcularCustoUnitarioEsperado(
    item.quantidade,
    item.quantidade_estoque,
    custoEstoque,
    item.quantidade_encomenda,
    custoEncomenda
  );

  const markupEsperado = calcularMarkup(item.preco_unitario, custoUnitarioEsperado);
  const reais = resolverCustosReais(item, {
    custoEstoque,
    custoEncomenda,
    custoUnitarioEsperado,
    markupEsperado,
    preservarEstadoRecebimento,
  });

  await client.query(`
    UPDATE venda_itens SET
      custo_estoque_unitario = $2,
      custo_encomenda_unitario = $3,
      custo_unitario_esperado = $4,
      markup_esperado = $5,
      custo_unitario_real = $6,
      markup_real = $7,
      custo_encomenda_real_acumulado = $8,
      quantidade_encomenda_recebida = $9,
      custo_extra_acumulado = $10
    WHERE id = $1
  `, [
    vendaItemId,
    custoEstoque,
    custoEncomenda,
    custoUnitarioEsperado,
    markupEsperado,
    reais.custo_unitario_real,
    reais.markup_real,
    reais.custo_encomenda_real_acumulado,
    reais.quantidade_encomenda_recebida,
    reais.custo_extra_acumulado,
  ]);

  return {
    custo_estoque_unitario: custoEstoque,
    custo_encomenda_unitario: custoEncomenda,
    custo_unitario_esperado: custoUnitarioEsperado,
    markup_esperado: markupEsperado,
    custo_unitario_real: reais.custo_unitario_real,
    markup_real: reais.markup_real,
  };
}

async function recalcularCustosVendaItem(client, vendaItemId) {
  return aplicarCustosMarkupVendaItem(client, vendaItemId, {
    preservarCustoEstoque: true,
    preservarEstadoRecebimento: true,
  });
}

async function processarMarkupAposRecebimento(client, {
  recebimentoId,
  vendaItemId,
  quantidade,
  custoRealUnitario,
}) {
  if (!vendaItemId) return null;

  const itemResult = await client.query(`
    SELECT vi.*, v.vendedor_id, v.numero AS venda_numero
    FROM venda_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    WHERE vi.id = $1
    FOR UPDATE OF vi
  `, [vendaItemId]);

  if (itemResult.rowCount === 0) return null;
  const item = itemResult.rows[0];
  const qty = Number(quantidade) || 0;
  const custoReal = Number(custoRealUnitario) || 0;
  const custoEsperadoEnc = Number(item.custo_encomenda_unitario) || 0;
  const valorAjusteUnit = round2(custoReal - custoEsperadoEnc);
  const valorAjuste = round2(valorAjusteUnit * qty);

  const novoRealAcum = round2((Number(item.custo_encomenda_real_acumulado) || 0) + (custoReal * qty));
  const novaQtdRec = (Number(item.quantidade_encomenda_recebida) || 0) + qty;
  const novoExtra = round2((Number(item.custo_extra_acumulado) || 0) + Math.max(valorAjuste, 0));

  const itemAtualizado = {
    ...item,
    custo_encomenda_real_acumulado: novoRealAcum,
    quantidade_encomenda_recebida: novaQtdRec,
    custo_extra_acumulado: novoExtra,
  };
  const { custo_unitario_real, markup_real } = recalcularCustoRealEMarkup(itemAtualizado);

  await client.query(`
    UPDATE venda_itens SET
      custo_encomenda_real_acumulado = $2,
      quantidade_encomenda_recebida = $3,
      custo_extra_acumulado = $4,
      custo_unitario_real = $5,
      markup_real = $6
    WHERE id = $1
  `, [
    vendaItemId,
    novoRealAcum,
    novaQtdRec,
    novoExtra,
    custo_unitario_real,
    markup_real,
  ]);

  if (valorAjuste !== 0 && item.vendedor_id) {
    await client.query(`
      INSERT INTO ajustes_comissao (
        vendedor_id, venda_id, venda_item_id, recebimento_id,
        quantidade, custo_esperado_unitario, custo_real_unitario, valor_ajuste
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      item.vendedor_id,
      item.venda_id,
      vendaItemId,
      recebimentoId,
      qty,
      custoEsperadoEnc,
      custoReal,
      valorAjuste,
    ]);
  }

  return {
    venda_item_id: vendaItemId,
    custo_unitario_real,
    markup_real,
    valor_ajuste: valorAjuste,
    markup_anterior: item.markup_esperado,
  };
}

async function reverterMarkupAposEstorno(client, recebimentoId) {
  const ajustes = await client.query(`
    SELECT * FROM ajustes_comissao
    WHERE recebimento_id = $1 AND status = 'pendente'
  `, [recebimentoId]);

  const rec = await client.query(`
    SELECT * FROM recebimento_encomenda_itens WHERE id = $1
  `, [recebimentoId]);
  if (rec.rowCount === 0) return;

  const recebimento = rec.rows[0];
  const vendaItemId = recebimento.venda_item_id;
  if (!vendaItemId) {
    await client.query(`DELETE FROM ajustes_comissao WHERE recebimento_id = $1`, [recebimentoId]);
    return;
  }

  const itemResult = await client.query(`
    SELECT * FROM venda_itens WHERE id = $1 FOR UPDATE
  `, [vendaItemId]);
  if (itemResult.rowCount === 0) return;

  const item = itemResult.rows[0];
  const qty = Number(recebimento.quantidade) || 0;
  const custoReal = Number(recebimento.custo_real) || 0;

  const novoRealAcum = round2(Math.max((Number(item.custo_encomenda_real_acumulado) || 0) - (custoReal * qty), 0));
  const novaQtdRec = Math.max((Number(item.quantidade_encomenda_recebida) || 0) - qty, 0);

  let novoExtra = Number(item.custo_extra_acumulado) || 0;
  for (const aj of ajustes.rows) {
    novoExtra = round2(novoExtra - Math.max(Number(aj.valor_ajuste) || 0, 0));
  }
  novoExtra = Math.max(novoExtra, 0);

  const itemAtualizado = {
    ...item,
    custo_encomenda_real_acumulado: novoRealAcum,
    quantidade_encomenda_recebida: novaQtdRec,
    custo_extra_acumulado: novoExtra,
  };
  const { custo_unitario_real, markup_real } = recalcularCustoRealEMarkup(itemAtualizado);
  const markupFinal = novaQtdRec === 0 && Number(item.quantidade_encomenda) > 0
    ? null
    : markup_real;

  await client.query(`
    UPDATE venda_itens SET
      custo_encomenda_real_acumulado = $2,
      quantidade_encomenda_recebida = $3,
      custo_extra_acumulado = $4,
      custo_unitario_real = $5,
      markup_real = $6
    WHERE id = $1
  `, [
    vendaItemId,
    novoRealAcum,
    novaQtdRec,
    novoExtra,
    custo_unitario_real,
    markupFinal,
  ]);

  await client.query(`DELETE FROM ajustes_comissao WHERE recebimento_id = $1`, [recebimentoId]);
}

module.exports = {
  calcularMarkup,
  calcularCustoUnitarioEsperado,
  recalcularCustoRealEMarkup,
  resolverCustoEstoqueCongelado,
  aplicarCustosMarkupVendaItem,
  recalcularCustosVendaItem,
  processarMarkupAposRecebimento,
  reverterMarkupAposEstorno,
};
