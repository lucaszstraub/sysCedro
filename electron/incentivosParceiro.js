const { getPool } = require('./database');
const { getSession } = require('./auth');
const { userHasPermission, PERMISSIONS } = require('./permissions');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function assertAcessoIncentivosParceiro() {
  const session = getSession();
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');
  if (!userHasPermission(session, PERMISSIONS.PARCEIROS)) {
    throw new Error('Acesso restrito à gerência e administração.');
  }
}

function normalizarStatusPagamento(status, dataPagamento) {
  const statusPagamento = status === 'pago' ? 'pago' : 'a_pagar';
  if (statusPagamento === 'pago') {
    const data = String(dataPagamento || '').trim();
    if (!data) {
      throw new Error('Informe a data do pagamento.');
    }
    return { status_pagamento: 'pago', data_pagamento: data };
  }
  return { status_pagamento: 'a_pagar', data_pagamento: null };
}

function calcularValorComissao(baseCalculo, tipoCalculo, valorInformado) {
  const base = Number(baseCalculo) || 0;
  if (base <= 0) {
    throw new Error('O pedido não possui valor de pagamento para calcular o incentivo.');
  }

  if (tipoCalculo === 'percentual') {
    const pct = Number(valorInformado);
    if (!Number.isFinite(pct) || pct <= 0) {
      throw new Error('Informe um percentual maior que zero.');
    }
    if (pct > 100) {
      throw new Error('O percentual não pode ser maior que 100%.');
    }
    return round2(base * pct / 100);
  }

  const valor = Number(valorInformado);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Informe um valor de incentivo maior que zero.');
  }
  if (valor > base) {
    throw new Error('O valor do incentivo não pode ser maior que o total pago do pedido.');
  }
  return round2(valor);
}

function calcularDeducoesProporcionais(itens, valorComissao) {
  const linhas = itens.map((item) => ({
    venda_item_id: item.id,
    valor_bruto: round2(Number(item.subtotal) || (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0)),
  })).filter((item) => item.valor_bruto > 0);

  if (linhas.length === 0) {
    throw new Error('O pedido não possui itens com valor para distribuir o incentivo.');
  }

  const totalBruto = linhas.reduce((sum, item) => sum + item.valor_bruto, 0);
  if (totalBruto <= 0) {
    throw new Error('O pedido não possui receita de itens para distribuir o incentivo.');
  }

  let acumulado = 0;
  return linhas.map((linha, index) => {
    let deducao;
    if (index === linhas.length - 1) {
      deducao = round2(valorComissao - acumulado);
    } else {
      deducao = round2((linha.valor_bruto / totalBruto) * valorComissao);
      acumulado += deducao;
    }
    return {
      venda_item_id: linha.venda_item_id,
      valor_bruto: linha.valor_bruto,
      valor_deducao: deducao,
      valor_liquido: round2(linha.valor_bruto - deducao),
    };
  });
}

async function getVendaBase(client, vendaId) {
  const result = await client.query(`
    SELECT v.id, v.numero, v.numero_pedido, v.total_pago, v.total, v.status
    FROM vendas v
    WHERE v.id = $1
  `, [vendaId]);
  if (result.rowCount === 0) throw new Error('Venda não encontrada.');
  const venda = result.rows[0];
  if (!['confirmada', 'entregue'].includes(venda.status)) {
    throw new Error('Só é possível registrar incentivo em vendas confirmadas ou entregues.');
  }
  return venda;
}

async function getItensVenda(client, vendaId) {
  const result = await client.query(`
    SELECT id, descricao, quantidade, preco_unitario, subtotal
    FROM venda_itens
    WHERE venda_id = $1
    ORDER BY id
  `, [vendaId]);
  return result.rows;
}

function mapIncentivoRow(row) {
  return {
    ...row,
    valor_comissao: round2(row.valor_comissao),
    valor_informado: round2(row.valor_informado),
    base_calculo: round2(row.base_calculo),
    total_pago: round2(row.total_pago),
    receita_itens: row.receita_itens != null ? round2(row.receita_itens) : null,
  };
}

async function fetchIncentivoParceiroPorVenda(vendaId) {
  const db = getPool();
  const header = await db.query(`
    SELECT
      vip.*,
      p.nome_completo AS parceiro_nome,
      p.nome_escritorio AS parceiro_escritorio,
      p.chave_pix AS parceiro_chave_pix,
      v.numero AS venda_numero,
      v.numero_pedido,
      v.total_pago,
      v.criado_em AS venda_criado_em,
      c.nome AS cliente_nome,
      vd.nome AS vendedor_nome
    FROM venda_incentivos_parceiro vip
    JOIN parceiros p ON p.id = vip.parceiro_id
    JOIN vendas v ON v.id = vip.venda_id
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE vip.venda_id = $1
  `, [vendaId]);
  if (header.rowCount === 0) return null;

  const itens = await db.query(`
    SELECT
      vii.*,
      vi.descricao AS item_descricao
    FROM venda_incentivo_parceiro_itens vii
    JOIN venda_itens vi ON vi.id = vii.venda_item_id
    WHERE vii.incentivo_id = $1
    ORDER BY vii.id
  `, [header.rows[0].id]);

  const row = mapIncentivoRow(header.rows[0]);
  return {
    ...row,
    itens: itens.rows.map((item) => ({
      ...item,
      valor_bruto: round2(item.valor_bruto),
      valor_deducao: round2(item.valor_deducao),
      valor_liquido: round2(item.valor_liquido),
    })),
  };
}

async function getIncentivoParceiro(vendaId) {
  assertAcessoIncentivosParceiro();
  return fetchIncentivoParceiroPorVenda(vendaId);
}

function buildFiltrosIncentivo(filtros = {}) {
  const busca = String(filtros.busca || '').trim();
  const parceiroId = filtros.parceiroId ? Number(filtros.parceiroId) : null;
  const statusPagamento = filtros.statusPagamento || null;

  const params = [];
  const where = ['1=1'];

  if (busca) {
    params.push(`%${busca}%`);
    const idx = params.length;
    where.push(`(
      v.numero ILIKE $${idx}
      OR v.numero_pedido ILIKE $${idx}
      OR c.nome ILIKE $${idx}
      OR vd.nome ILIKE $${idx}
      OR p.nome_completo ILIKE $${idx}
      OR COALESCE(p.nome_escritorio, '') ILIKE $${idx}
    )`);
  }

  if (parceiroId) {
    params.push(parceiroId);
    where.push(`vip.parceiro_id = $${params.length}`);
  }
  if (statusPagamento === 'a_pagar' || statusPagamento === 'pago') {
    params.push(statusPagamento);
    where.push(`vip.status_pagamento = $${params.length}`);
  }

  return { params, whereClause: where.join(' AND ') };
}

async function listIncentivosParceiro(filtros = {}) {
  assertAcessoIncentivosParceiro();
  const db = getPool();
  const { params, whereClause } = buildFiltrosIncentivo(filtros);

  const resumo = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE vip.status_pagamento = 'a_pagar')::int AS qtd_a_pagar,
      COALESCE(SUM(vip.valor_comissao) FILTER (WHERE vip.status_pagamento = 'a_pagar'), 0) AS total_a_pagar,
      COUNT(*) FILTER (WHERE vip.status_pagamento = 'pago')::int AS qtd_pago,
      COALESCE(SUM(vip.valor_comissao) FILTER (WHERE vip.status_pagamento = 'pago'), 0) AS total_pago
    FROM venda_incentivos_parceiro vip
    JOIN vendas v ON v.id = vip.venda_id
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    JOIN parceiros p ON p.id = vip.parceiro_id
    WHERE ${whereClause}
  `, params);

  const result = await db.query(`
    SELECT
      vip.id,
      vip.venda_id,
      vip.parceiro_id,
      vip.tipo_calculo,
      vip.valor_informado,
      vip.valor_comissao,
      vip.base_calculo,
      vip.status_pagamento,
      vip.data_pagamento,
      vip.observacoes,
      vip.criado_em,
      vip.atualizado_em,
      v.numero AS venda_numero,
      v.numero_pedido,
      v.total_pago,
      v.criado_em AS venda_criado_em,
      c.nome AS cliente_nome,
      vd.nome AS vendedor_nome,
      p.nome_completo AS parceiro_nome,
      p.nome_escritorio AS parceiro_escritorio,
      p.chave_pix AS parceiro_chave_pix
    FROM venda_incentivos_parceiro vip
    JOIN vendas v ON v.id = vip.venda_id
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    JOIN parceiros p ON p.id = vip.parceiro_id
    WHERE ${whereClause}
    ORDER BY
      CASE WHEN vip.status_pagamento = 'a_pagar' THEN 0 ELSE 1 END,
      vip.criado_em DESC
    LIMIT 300
  `, params);

  const r = resumo.rows[0];
  return {
    resumo: {
      qtd_a_pagar: Number(r.qtd_a_pagar) || 0,
      total_a_pagar: round2(r.total_a_pagar),
      qtd_pago: Number(r.qtd_pago) || 0,
      total_pago: round2(r.total_pago),
    },
    incentivos: result.rows.map(mapIncentivoRow),
  };
}

async function buscarVendasParaNovoIncentivo(busca = '') {
  assertAcessoIncentivosParceiro();
  const db = getPool();
  const termo = `%${String(busca || '').trim()}%`;

  const result = await db.query(`
    SELECT
      v.id,
      v.numero,
      v.numero_pedido,
      v.criado_em,
      v.total_pago,
      c.nome AS cliente_nome,
      vd.nome AS vendedor_nome,
      COALESCE(SUM(vi.subtotal), 0) AS receita_itens
    FROM vendas v
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    LEFT JOIN venda_itens vi ON vi.venda_id = v.id
    LEFT JOIN venda_incentivos_parceiro vip ON vip.venda_id = v.id
    WHERE v.status IN ('confirmada', 'entregue')
      AND COALESCE(v.desativada, false) = false
      AND vip.id IS NULL
      AND (
        $1 = '%%'
        OR v.numero ILIKE $1
        OR v.numero_pedido ILIKE $1
        OR c.nome ILIKE $1
        OR vd.nome ILIKE $1
      )
    GROUP BY v.id, c.nome, vd.nome
    ORDER BY v.criado_em DESC
    LIMIT 40
  `, [termo]);

  return result.rows.map((row) => ({
    ...row,
    receita_itens: round2(row.receita_itens),
    total_pago: round2(row.total_pago),
  }));
}

async function salvarIncentivoParceiro(data) {
  assertAcessoIncentivosParceiro();
  const session = getSession();
  const vendaId = Number(data.venda_id);
  const parceiroId = Number(data.parceiro_id);
  const tipoCalculo = data.tipo_calculo;
  const { status_pagamento: statusPagamento, data_pagamento: dataPagamento } = normalizarStatusPagamento(
    data.status_pagamento,
    data.data_pagamento
  );

  if (!vendaId) throw new Error('Selecione um pedido de venda.');
  if (!parceiroId) throw new Error('Selecione o parceiro.');
  if (!['valor', 'percentual'].includes(tipoCalculo)) {
    throw new Error('Tipo de cálculo inválido.');
  }

  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const venda = await getVendaBase(client, vendaId);
    const parceiro = await client.query(
      'SELECT id FROM parceiros WHERE id = $1 AND ativo = true',
      [parceiroId]
    );
    if (parceiro.rowCount === 0) throw new Error('Parceiro não encontrado ou inativo.');

    const itens = await getItensVenda(client, vendaId);
    const baseCalculo = round2(venda.total_pago ?? venda.total);
    const valorComissao = calcularValorComissao(baseCalculo, tipoCalculo, data.valor_informado);
    const deducoes = calcularDeducoesProporcionais(itens, valorComissao);

    const existente = await client.query(
      'SELECT id FROM venda_incentivos_parceiro WHERE venda_id = $1',
      [vendaId]
    );

    let incentivoId;
    if (existente.rowCount > 0) {
      incentivoId = existente.rows[0].id;
      await client.query(`
        UPDATE venda_incentivos_parceiro SET
          parceiro_id = $2,
          tipo_calculo = $3,
          valor_informado = $4,
          valor_comissao = $5,
          base_calculo = $6,
          status_pagamento = $7,
          data_pagamento = $8,
          observacoes = $9,
          usuario_id = $10,
          usuario_nome = $11,
          atualizado_em = NOW()
        WHERE id = $1
      `, [
        incentivoId,
        parceiroId,
        tipoCalculo,
        round2(data.valor_informado),
        valorComissao,
        baseCalculo,
        statusPagamento,
        dataPagamento,
        data.observacoes?.trim() || null,
        session?.id || null,
        session?.nome || null,
      ]);
      await client.query('DELETE FROM venda_incentivo_parceiro_itens WHERE incentivo_id = $1', [incentivoId]);
    } else {
      const created = await client.query(`
        INSERT INTO venda_incentivos_parceiro (
          venda_id, parceiro_id, tipo_calculo, valor_informado, valor_comissao,
          base_calculo, status_pagamento, data_pagamento, observacoes, usuario_id, usuario_nome
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        vendaId,
        parceiroId,
        tipoCalculo,
        round2(data.valor_informado),
        valorComissao,
        baseCalculo,
        statusPagamento,
        dataPagamento,
        data.observacoes?.trim() || null,
        session?.id || null,
        session?.nome || null,
      ]);
      incentivoId = created.rows[0].id;
    }

    for (const item of deducoes) {
      await client.query(`
        INSERT INTO venda_incentivo_parceiro_itens (
          incentivo_id, venda_item_id, valor_bruto, valor_deducao, valor_liquido
        )
        VALUES ($1, $2, $3, $4, $5)
      `, [
        incentivoId,
        item.venda_item_id,
        item.valor_bruto,
        item.valor_deducao,
        item.valor_liquido,
      ]);
    }

    await client.query('COMMIT');
    return getIncentivoParceiro(vendaId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function removerIncentivoParceiro(vendaId) {
  assertAcessoIncentivosParceiro();
  const db = getPool();
  const result = await db.query(
    'DELETE FROM venda_incentivos_parceiro WHERE venda_id = $1 RETURNING id',
    [vendaId]
  );
  if (result.rowCount === 0) throw new Error('Nenhum incentivo registrado para este pedido.');
  return { success: true };
}

module.exports = {
  assertAcessoIncentivosParceiro,
  fetchIncentivoParceiroPorVenda,
  getIncentivoParceiro,
  listIncentivosParceiro,
  buscarVendasParaNovoIncentivo,
  salvarIncentivoParceiro,
  removerIncentivoParceiro,
  calcularValorComissao,
  calcularDeducoesProporcionais,
};
