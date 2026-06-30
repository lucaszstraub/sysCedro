const { getPool } = require('./database');
const { getSession } = require('./auth');
const { userIsAdministrador } = require('./permissions');
const { calcularMetricasItemProduto } = require('./analiseVendas');
const {
  calcularPercentualComissao,
  calcularValorComissao,
  getRegrasMap,
} = require('./comissaoRegras');
const { mesReferenciaFromDate, registrarAjusteComissao } = require('./comissaoAjustes');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function assertAcessoComissaoVendas() {
  const session = getSession();
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');
  if (!userIsAdministrador(session)) {
    throw new Error('Acesso restrito à administração do sistema.');
  }
}

function normalizarFiltros(filtros = {}) {
  if (typeof filtros === 'string') return { busca: filtros };
  return filtros || {};
}

function buildFiltros(filtros = {}) {
  const f = normalizarFiltros(filtros);
  const params = [];
  const where = [
    "v.status IN ('confirmada', 'entregue')",
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
      OR COALESCE(ben.nome, '') ILIKE $${idx}
    )`);
  }

  if (f.vendedorId) {
    params.push(Number(f.vendedorId));
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

  if (f.perfilComissao === 'vendedor' || f.perfilComissao === 'gerente') {
    params.push(f.perfilComissao);
    where.push(`vc.perfil_comissao = $${params.length}`);
  }

  if (f.ano) {
    params.push(Number(f.ano));
    where.push(`EXTRACT(YEAR FROM v.criado_em)::int = $${params.length}`);
  }

  if (f.mes) {
    params.push(Number(f.mes));
    where.push(`EXTRACT(MONTH FROM v.criado_em)::int = $${params.length}`);
  }

  return { params, whereClause: where.join(' AND ') };
}

function resolverBeneficiario(perfil, regra, vendaVendedorId) {
  if (perfil === 'vendedor') return vendaVendedorId || null;
  return regra?.beneficiario_vendedor_id || null;
}

async function resolverBeneficiarioGerente(client, regra) {
  const cadastrado = regra?.beneficiario_vendedor_id;
  if (cadastrado) return cadastrado;

  const porUsuario = await client.query(`
    SELECT v.id
    FROM vendedores v
    INNER JOIN usuarios u ON u.vendedor_id = v.id AND u.ativo = true
    WHERE u.atribuicao IN ('gerente', 'administracao') AND v.ativo = true
    ORDER BY CASE u.atribuicao WHEN 'gerente' THEN 0 ELSE 1 END, v.id
    LIMIT 1
  `);
  if (porUsuario.rows[0]?.id) return porUsuario.rows[0].id;

  return null;
}

function inferirMotivoAlteracao(anterior, metricas) {
  if (anterior?.markup_real != null && metricas.markup_real != null
    && Math.abs(Number(anterior.markup_real) - Number(metricas.markup_real)) >= 0.0001) {
    return 'custo_encomenda';
  }
  if (anterior?.base_calculo != null && metricas.receita_liquida_real != null
    && Math.abs(Number(anterior.base_calculo) - Number(metricas.receita_liquida_real)) >= 0.01) {
    return 'incentivo_parceiro';
  }
  return 'recalculo';
}

async function registrarExclusaoComissao(client, row, motivo, ctx = {}) {
  await registrarAjusteComissao(client, {
    mes_referencia: ctx.mes_referencia,
    perfil_comissao: row.perfil_comissao,
    beneficiario_vendedor_id: row.beneficiario_vendedor_id,
    venda_comissao_id: row.id,
    venda_id: row.venda_id,
    venda_item_id: row.venda_item_id,
    tipo: 'exclusao',
    motivo,
    valor_anterior: row.valor_comissao,
    valor_novo: 0,
    venda_numero: ctx.venda_numero,
    numero_pedido: ctx.numero_pedido,
    item_descricao: ctx.item_descricao,
  });
}

async function sincronizarComissaoItem(client, itemRow, regras, vendaCtx, gerenteBeneficiarioId) {
  const existentes = await client.query(
    'SELECT * FROM venda_comissoes WHERE venda_item_id = $1',
    [itemRow.venda_item_id]
  );

  const mesReferencia = mesReferenciaFromDate(vendaCtx.criado_em);
  const ctxBase = {
    mes_referencia: mesReferencia,
    venda_id: itemRow.venda_id,
    venda_item_id: itemRow.venda_item_id,
    venda_numero: vendaCtx.venda_numero,
    numero_pedido: vendaCtx.numero_pedido,
    item_descricao: itemRow.item_descricao,
  };

  if ((itemRow.status || 'efetivo') !== 'efetivo' || Number(itemRow.subtotal) <= 0) {
    for (const row of existentes.rows) {
      await registrarExclusaoComissao(client, row, 'item_cancelado_ou_consignado', ctxBase);
    }
    await client.query('DELETE FROM venda_comissoes WHERE venda_item_id = $1', [itemRow.venda_item_id]);
    return [];
  }

  const metricas = calcularMetricasItemProduto(itemRow);
  const mapExistentes = {};
  for (const row of existentes.rows) {
    mapExistentes[row.perfil_comissao] = row;
  }

  if (!metricas.tem_custo_real || metricas.markup_real == null) {
    for (const row of existentes.rows) {
      await registrarExclusaoComissao(client, row, 'item_sem_custo', ctxBase);
    }
    await client.query(
      'DELETE FROM venda_comissoes WHERE venda_item_id = $1',
      [itemRow.venda_item_id]
    );
    return [];
  }

  const criados = [];
  const perfisAtivos = new Set();

  for (const perfil of ['vendedor', 'gerente']) {
    const regra = regras[perfil];
    if (!regra) continue;

    const beneficiarioId = perfil === 'gerente'
      ? gerenteBeneficiarioId
      : resolverBeneficiario(perfil, regra, vendaCtx.vendedor_id);

    if (perfil === 'vendedor' && !beneficiarioId) continue;

    const percentual = calcularPercentualComissao(metricas.markup_real, regra);
    if (percentual == null) continue;

    const valor = calcularValorComissao(metricas.receita_liquida_real, percentual);
    if (valor <= 0) continue;

    perfisAtivos.add(perfil);
    const anterior = mapExistentes[perfil];

    const result = await client.query(`
      INSERT INTO venda_comissoes (
        venda_id, venda_item_id, perfil_comissao, beneficiario_vendedor_id,
        markup_real, percentual_comissao, base_calculo, valor_comissao,
        status_pagamento, atualizado_em
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'a_pagar', NOW())
      ON CONFLICT (venda_item_id, perfil_comissao) DO UPDATE SET
        beneficiario_vendedor_id = EXCLUDED.beneficiario_vendedor_id,
        markup_real = EXCLUDED.markup_real,
        percentual_comissao = EXCLUDED.percentual_comissao,
        base_calculo = EXCLUDED.base_calculo,
        valor_comissao = EXCLUDED.valor_comissao,
        atualizado_em = NOW()
      RETURNING id, valor_comissao
    `, [
      itemRow.venda_id,
      itemRow.venda_item_id,
      perfil,
      beneficiarioId,
      metricas.markup_real,
      percentual,
      metricas.receita_liquida_real,
      valor,
    ]);

    const novoId = result.rows[0].id;
    const novoValor = round2(result.rows[0].valor_comissao);

    if (!anterior) {
      // Novos lançamentos não geram ajuste — entram no valor devido do mês.
    } else if (Math.abs(round2(anterior.valor_comissao) - novoValor) >= 0.01) {
      await registrarAjusteComissao(client, {
        ...ctxBase,
        perfil_comissao: perfil,
        beneficiario_vendedor_id: beneficiarioId,
        venda_comissao_id: novoId,
        tipo: 'alteracao',
        motivo: inferirMotivoAlteracao(anterior, metricas),
        valor_anterior: anterior.valor_comissao,
        valor_novo: novoValor,
      });
    }

    criados.push(novoId);
  }

  for (const row of existentes.rows) {
    if (!perfisAtivos.has(row.perfil_comissao)) {
      await registrarExclusaoComissao(client, row, 'recalculo', ctxBase);
      await client.query('DELETE FROM venda_comissoes WHERE id = $1', [row.id]);
    }
  }

  return criados;
}

async function limparComissoesVendasInvalidas(client) {
  const invalidas = await client.query(`
    SELECT
      vc.*,
      v.status AS venda_status,
      v.criado_em,
      v.numero AS venda_numero,
      v.numero_pedido,
      vi.descricao AS item_descricao
    FROM venda_comissoes vc
    JOIN vendas v ON v.id = vc.venda_id
    JOIN venda_itens vi ON vi.id = vc.venda_item_id
    WHERE v.status NOT IN ('confirmada', 'entregue')
  `);

  for (const row of invalidas.rows) {
    const motivo = row.venda_status && !['confirmada', 'entregue'].includes(row.venda_status)
      ? 'cancelamento_venda'
      : 'recalculo';
    await registrarExclusaoComissao(client, row, motivo, {
      mes_referencia: mesReferenciaFromDate(row.criado_em),
      venda_numero: row.venda_numero,
      numero_pedido: row.numero_pedido,
      item_descricao: row.item_descricao,
    });
  }

  if (invalidas.rowCount > 0) {
    await client.query(`
      DELETE FROM venda_comissoes vc
      USING vendas v
      WHERE vc.venda_id = v.id
        AND v.status NOT IN ('confirmada', 'entregue')
    `);
  }
}

async function sincronizarComissoes() {
  assertAcessoComissaoVendas();
  const db = getPool();
  const client = await db.connect();
  const regras = await getRegrasMap();

  try {
    await client.query('BEGIN');
    await limparComissoesVendasInvalidas(client);

    const gerenteBeneficiarioId = await resolverBeneficiarioGerente(client, regras.gerente);

    const vendas = await client.query(`
      SELECT v.id, v.vendedor_id, v.criado_em, v.numero AS venda_numero, v.numero_pedido
      FROM vendas v
      WHERE v.status IN ('confirmada', 'entregue')
        AND COALESCE(v.desativada, false) = false
    `);

    let itensProcessados = 0;
    for (const venda of vendas.rows) {
      const itens = await client.query(`
        SELECT
          vi.id AS venda_item_id,
          vi.venda_id,
          vi.descricao AS item_descricao,
          vi.subtotal,
          vi.quantidade,
          vi.preco_unitario,
          vi.preco_unitario_lista,
          vi.custo_unitario_real,
          vi.status,
          COALESCE(vii.valor_deducao, 0) AS incentivo_deducao
        FROM venda_itens vi
        LEFT JOIN venda_incentivos_parceiro vip ON vip.venda_id = vi.venda_id
        LEFT JOIN venda_incentivo_parceiro_itens vii
          ON vii.incentivo_id = vip.id AND vii.venda_item_id = vi.id
        WHERE vi.venda_id = $1
      `, [venda.id]);

      for (const item of itens.rows) {
        await sincronizarComissaoItem(client, item, regras, venda, gerenteBeneficiarioId);
        itensProcessados += 1;
      }
    }

    await client.query('COMMIT');
    return {
      itens_processados: itensProcessados,
      gerente_beneficiario_id: gerenteBeneficiarioId,
      regra_gerente_ativa: Boolean(regras.gerente),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function sincronizarComissoesVenda(vendaId) {
  const db = getPool();
  const client = await db.connect();
  const regras = await getRegrasMap();

  try {
    await client.query('BEGIN');
    const gerenteBeneficiarioId = await resolverBeneficiarioGerente(client, regras.gerente);
    const venda = await client.query(`
      SELECT id, vendedor_id, criado_em, numero AS venda_numero, numero_pedido
      FROM vendas
      WHERE id = $1
        AND status IN ('confirmada', 'entregue')
        AND COALESCE(desativada, false) = false
    `, [vendaId]);
    if (venda.rowCount === 0) {
      await client.query('COMMIT');
      return { itens_processados: 0 };
    }

    const itens = await client.query(`
      SELECT
        vi.id AS venda_item_id,
        vi.venda_id,
        vi.descricao AS item_descricao,
        vi.subtotal,
        vi.quantidade,
        vi.preco_unitario,
        vi.preco_unitario_lista,
        vi.custo_unitario_real,
        vi.status,
        COALESCE(vii.valor_deducao, 0) AS incentivo_deducao
      FROM venda_itens vi
      LEFT JOIN venda_incentivos_parceiro vip ON vip.venda_id = vi.venda_id
      LEFT JOIN venda_incentivo_parceiro_itens vii
        ON vii.incentivo_id = vip.id AND vii.venda_item_id = vi.id
      WHERE vi.venda_id = $1
    `, [vendaId]);

    for (const item of itens.rows) {
      await sincronizarComissaoItem(client, item, regras, venda.rows[0], gerenteBeneficiarioId);
    }

    await client.query('COMMIT');
    return { itens_processados: itens.rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listControleComissoes(filtros = {}) {
  assertAcessoComissaoVendas();
  await sincronizarComissoes();

  const db = getPool();
  const { params, whereClause } = buildFiltros(filtros);

  const resumo = await db.query(`
    SELECT
      COUNT(*)::int AS qtd_lancamentos,
      COALESCE(SUM(vc.valor_comissao), 0) AS total_devido,
      COALESCE(SUM(vc.valor_comissao) FILTER (WHERE vc.perfil_comissao = 'vendedor'), 0) AS vendedor_devido,
      COALESCE(SUM(vc.valor_comissao) FILTER (WHERE vc.perfil_comissao = 'gerente'), 0) AS gerente_devido
    FROM venda_comissoes vc
    JOIN vendas v ON v.id = vc.venda_id
    JOIN venda_itens vi ON vi.id = vc.venda_item_id
    JOIN clientes c ON c.id = v.cliente_id
    JOIN vendedores vd ON vd.id = v.vendedor_id
    LEFT JOIN vendedores ben ON ben.id = vc.beneficiario_vendedor_id
    WHERE ${whereClause}
  `, params);

  const result = await db.query(`
    SELECT
      vc.*,
      vi.descricao AS item_descricao,
      p.sku AS produto_sku,
      v.numero AS venda_numero,
      v.numero_pedido,
      v.criado_em AS venda_criado_em,
      EXTRACT(YEAR FROM v.criado_em)::int AS venda_ano,
      EXTRACT(MONTH FROM v.criado_em)::int AS venda_mes,
      c.nome AS cliente_nome,
      vd.nome AS vendedor_venda_nome,
      ben.nome AS beneficiario_nome
    FROM venda_comissoes vc
    JOIN vendas v ON v.id = vc.venda_id
    JOIN venda_itens vi ON vi.id = vc.venda_item_id
    JOIN clientes c ON c.id = v.cliente_id
    JOIN vendedores vd ON vd.id = v.vendedor_id
    LEFT JOIN vendedores ben ON ben.id = vc.beneficiario_vendedor_id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE ${whereClause}
    ORDER BY v.criado_em DESC, vi.id, vc.perfil_comissao
    LIMIT 1000
  `, params);

  const r = resumo.rows[0];
  return {
    resumo: {
      qtd_lancamentos: Number(r.qtd_lancamentos) || 0,
      total_devido: round2(r.total_devido),
      vendedor_devido: round2(r.vendedor_devido),
      gerente_devido: round2(r.gerente_devido),
    },
    comissoes: result.rows.map((row) => ({
      ...row,
      markup_real: row.markup_real != null ? Number(row.markup_real) : null,
      percentual_comissao: Number(row.percentual_comissao),
      base_calculo: round2(row.base_calculo),
      valor_comissao: round2(row.valor_comissao),
    })),
  };
}

module.exports = {
  listControleComissoes,
  sincronizarComissoes,
  sincronizarComissoesVenda,
};
