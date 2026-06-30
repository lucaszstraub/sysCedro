function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function mesReferenciaFromDate(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatCurrencyBr(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(valor) || 0);
}

function buildDescricaoAlteracao(ctx) {
  const pedido = ctx.numero_pedido || ctx.venda_numero || `venda #${ctx.venda_id}`;
  const produto = ctx.item_descricao || 'Produto';
  const anterior = formatCurrencyBr(ctx.valor_anterior);
  const novo = formatCurrencyBr(ctx.valor_novo);

  if (ctx.motivo === 'custo_encomenda') {
    return `${produto} (${pedido}): custo de encomenda alterou a comissão de ${anterior} para ${novo}.`;
  }
  if (ctx.motivo === 'cancelamento_venda') {
    return `${pedido}: venda cancelada — comissão de ${anterior} removida.`;
  }
  if (ctx.motivo === 'item_sem_custo') {
    return `${produto} (${pedido}): sem custo real — comissão de ${anterior} removida.`;
  }
  if (ctx.motivo === 'incentivo_parceiro') {
    return `${produto} (${pedido}): incentivo a parceiro alterou a comissão de ${anterior} para ${novo}.`;
  }
  return `${produto} (${pedido}): comissão recalculada de ${anterior} para ${novo}.`;
}

function buildDescricaoInclusao(ctx) {
  const pedido = ctx.numero_pedido || ctx.venda_numero || `venda #${ctx.venda_id}`;
  const produto = ctx.item_descricao || 'Produto';
  return `${produto} (${pedido}): comissão incluída — ${formatCurrencyBr(ctx.valor_novo)}.`;
}

function buildDescricaoExclusao(ctx) {
  const pedido = ctx.numero_pedido || ctx.venda_numero || `venda #${ctx.venda_id}`;
  const produto = ctx.item_descricao || 'Produto';
  const anterior = formatCurrencyBr(ctx.valor_anterior);

  if (ctx.motivo === 'cancelamento_venda') {
    return `${pedido}: venda cancelada — comissão de ${anterior} removida.`;
  }
  if (ctx.motivo === 'item_sem_custo') {
    return `${produto} (${pedido}): sem custo real — comissão de ${anterior} removida.`;
  }
  return `${produto} (${pedido}): comissão de ${anterior} removida.`;
}

async function registrarAjusteComissao(client, data) {
  const valorAnterior = data.valor_anterior != null ? round2(data.valor_anterior) : null;
  const valorNovo = round2(data.valor_novo ?? 0);
  const diferenca = round2(valorNovo - (valorAnterior ?? 0));

  if (data.tipo === 'alteracao' && Math.abs(diferenca) < 0.01) {
    return null;
  }
  if (data.tipo === 'inclusao' && valorNovo <= 0) {
    return null;
  }
  if (data.tipo === 'exclusao' && (valorAnterior == null || valorAnterior <= 0)) {
    return null;
  }

  let descricao = data.descricao;
  if (!descricao) {
    if (data.tipo === 'inclusao') descricao = buildDescricaoInclusao(data);
    else if (data.tipo === 'exclusao') descricao = buildDescricaoExclusao(data);
    else descricao = buildDescricaoAlteracao(data);
  }

  const result = await client.query(`
    INSERT INTO comissao_ajustes (
      mes_referencia, perfil_comissao, beneficiario_vendedor_id,
      venda_comissao_id, venda_id, venda_item_id,
      tipo, motivo, valor_anterior, valor_novo, diferenca, descricao
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [
    data.mes_referencia,
    data.perfil_comissao,
    data.beneficiario_vendedor_id || null,
    data.venda_comissao_id || null,
    data.venda_id || null,
    data.venda_item_id || null,
    data.tipo,
    data.motivo,
    valorAnterior,
    valorNovo,
    diferenca,
    descricao,
  ]);

  return result.rows[0].id;
}

module.exports = {
  mesReferenciaFromDate,
  registrarAjusteComissao,
};
