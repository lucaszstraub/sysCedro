const { getPool } = require('./database');
const { getSession } = require('./auth');
const { userIsAdministrador } = require('./permissions');
const {
  calcularComissaoPlanejado,
  getRegraPlanejados,
} = require('./comissaoRegrasPlanejados');

const MESES_LABEL = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function assertAcesso() {
  const session = getSession();
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');
  if (!userIsAdministrador(session)) {
    throw new Error('Acesso restrito à administração do sistema.');
  }
}

function periodoKey(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function mapPagamentoRow(row) {
  return {
    ...row,
    valor_pago: round2(row.valor_pago),
    valor_devido_na_ocasiao: row.valor_devido_na_ocasiao != null
      ? round2(row.valor_devido_na_ocasiao)
      : null,
  };
}

async function sincronizarComissoesPlanejados(anoFiltro = null) {
  assertAcesso();
  const db = getPool();
  const client = await db.connect();
  const regra = await getRegraPlanejados();

  try {
    await client.query('BEGIN');

    const params = [];
    let anoClause = '';
    if (anoFiltro) {
      params.push(Number(anoFiltro));
      anoClause = `AND EXTRACT(YEAR FROM v.criado_em)::int = $${params.length}`;
    }

    const vendas = await client.query(`
      SELECT
        EXTRACT(YEAR FROM v.criado_em)::int AS ano,
        EXTRACT(MONTH FROM v.criado_em)::int AS mes,
        v.vendedor_id,
        COALESCE(SUM(v.total), 0) AS total_vendas,
        COUNT(*)::int AS qtd_vendas
      FROM vendas_planejados v
      WHERE v.status = 'confirmada'
        AND v.vendedor_id IS NOT NULL
        ${anoClause}
      GROUP BY 1, 2, 3
    `, params);

    const chavesAtivas = new Set();

    for (const row of vendas.rows) {
      const calc = calcularComissaoPlanejado(row.total_vendas, regra);
      const key = `${periodoKey(row.ano, row.mes)}:${row.vendedor_id}`;
      chavesAtivas.add(key);

      await client.query(`
        INSERT INTO comissao_planejado_mensal (
          ano, mes, vendedor_id,
          total_vendas, valor_limite, percentual_ate_limite, percentual_acima_limite,
          base_ate_limite, base_acima_limite, valor_faixa_ate, valor_faixa_acima,
          valor_comissao, qtd_vendas, atualizado_em
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (ano, mes, vendedor_id) DO UPDATE SET
          total_vendas = EXCLUDED.total_vendas,
          valor_limite = EXCLUDED.valor_limite,
          percentual_ate_limite = EXCLUDED.percentual_ate_limite,
          percentual_acima_limite = EXCLUDED.percentual_acima_limite,
          base_ate_limite = EXCLUDED.base_ate_limite,
          base_acima_limite = EXCLUDED.base_acima_limite,
          valor_faixa_ate = EXCLUDED.valor_faixa_ate,
          valor_faixa_acima = EXCLUDED.valor_faixa_acima,
          valor_comissao = EXCLUDED.valor_comissao,
          qtd_vendas = EXCLUDED.qtd_vendas,
          atualizado_em = NOW()
      `, [
        row.ano,
        row.mes,
        row.vendedor_id,
        calc.total_vendas,
        calc.valor_limite,
        calc.percentual_ate_limite,
        calc.percentual_acima_limite,
        calc.base_ate_limite,
        calc.base_acima_limite,
        calc.valor_faixa_ate,
        calc.valor_faixa_acima,
        calc.valor_comissao,
        row.qtd_vendas,
      ]);
    }

    if (anoFiltro) {
      const existentes = await client.query(
        'SELECT ano, mes, vendedor_id FROM comissao_planejado_mensal WHERE ano = $1',
        [Number(anoFiltro)]
      );
      for (const row of existentes.rows) {
        const key = `${periodoKey(row.ano, row.mes)}:${row.vendedor_id}`;
        if (!chavesAtivas.has(key)) {
          await client.query(
            'DELETE FROM comissao_planejado_mensal WHERE ano = $1 AND mes = $2 AND vendedor_id = $3',
            [row.ano, row.mes, row.vendedor_id]
          );
        }
      }
    }

    await client.query('COMMIT');
    return { periodos_processados: vendas.rowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getControleMensalPlanejados(filtros = {}) {
  assertAcesso();
  const ano = Number(filtros.ano) || new Date().getFullYear();
  await sincronizarComissoesPlanejados(ano);

  const db = getPool();
  const vendedorId = filtros.vendedorId ? Number(filtros.vendedorId) : null;

  const params = [ano];
  let vendedorClause = '';
  if (vendedorId) {
    params.push(vendedorId);
    vendedorClause = `AND cm.vendedor_id = $${params.length}`;
  }

  const devidos = await db.query(`
    SELECT
      cm.*,
      vd.nome AS vendedor_nome
    FROM comissao_planejado_mensal cm
    JOIN vendedores vd ON vd.id = cm.vendedor_id
    WHERE cm.ano = $1 ${vendedorClause}
    ORDER BY cm.mes, vd.nome
  `, params);

  const pagos = await db.query(`
    SELECT
      ano, mes, vendedor_id,
      COALESCE(SUM(valor_pago), 0) AS valor_pago,
      COUNT(*)::int AS qtd_pagamentos
    FROM comissao_planejado_pagamentos
    WHERE ano = $1 ${vendedorId ? `AND vendedor_id = $${params.length}` : ''}
    GROUP BY 1, 2, 3
  `, vendedorId ? params : [ano]);

  const pagamentosDetalhe = await db.query(`
    SELECT cp.*, fp.nome AS forma_pagamento_nome, vd.nome AS vendedor_nome
    FROM comissao_planejado_pagamentos cp
    LEFT JOIN formas_pagamento fp ON fp.id = cp.forma_pagamento_id
    JOIN vendedores vd ON vd.id = cp.vendedor_id
    WHERE cp.ano = $1 ${vendedorId ? `AND cp.vendedor_id = $${params.length}` : ''}
    ORDER BY cp.data_pagamento DESC, cp.id DESC
  `, vendedorId ? params : [ano]);

  const pagoMap = {};
  for (const row of pagos.rows) {
    pagoMap[`${periodoKey(row.ano, row.mes)}:${row.vendedor_id}`] = row;
  }

  const pagamentosPorPeriodo = {};
  for (const row of pagamentosDetalhe.rows) {
    const key = `${periodoKey(row.ano, row.mes)}:${row.vendedor_id}`;
    if (!pagamentosPorPeriodo[key]) pagamentosPorPeriodo[key] = [];
    pagamentosPorPeriodo[key].push(mapPagamentoRow(row));
  }

  const saldoPorVendedor = {};
  const periodos = [];

  const devidosPorVendedor = {};
  for (const row of devidos.rows) {
    if (!devidosPorVendedor[row.vendedor_id]) {
      devidosPorVendedor[row.vendedor_id] = [];
    }
    devidosPorVendedor[row.vendedor_id].push(row);
  }

  for (const vId of Object.keys(devidosPorVendedor).map(Number).sort((a, b) => a - b)) {
    saldoPorVendedor[vId] = 0;
    const rows = devidosPorVendedor[vId].sort((a, b) => a.mes - b.mes);

    for (const dev of rows) {
      const key = `${periodoKey(dev.ano, dev.mes)}:${dev.vendedor_id}`;
      const pag = pagoMap[key];

      const valorDevido = round2(dev.valor_comissao);
      const valorPago = round2(pag?.valor_pago || 0);
      const saldoAnterior = round2(saldoPorVendedor[vId]);
      const diferencaMes = round2(valorPago - valorDevido);
      const saldoAcumulado = round2(saldoAnterior + diferencaMes);
      saldoPorVendedor[vId] = saldoAcumulado;
      const liquidoAPagar = round2(valorDevido - valorPago - saldoAnterior);

      periodos.push({
        ano: dev.ano,
        mes: dev.mes,
        mes_label: MESES_LABEL[dev.mes],
        vendedor_id: dev.vendedor_id,
        vendedor_nome: dev.vendedor_nome,
        total_vendas: round2(dev.total_vendas),
        qtd_vendas: Number(dev.qtd_vendas) || 0,
        valor_limite: round2(dev.valor_limite),
        percentual_ate_limite: Number(dev.percentual_ate_limite),
        percentual_acima_limite: Number(dev.percentual_acima_limite),
        base_ate_limite: round2(dev.base_ate_limite),
        base_acima_limite: round2(dev.base_acima_limite),
        valor_faixa_ate: round2(dev.valor_faixa_ate),
        valor_faixa_acima: round2(dev.valor_faixa_acima),
        valor_devido: valorDevido,
        valor_pago: valorPago,
        diferenca_mes: diferencaMes,
        saldo_anterior: saldoAnterior,
        saldo_acumulado: saldoAcumulado,
        liquido_a_pagar: liquidoAPagar,
        qtd_pagamentos: Number(pag?.qtd_pagamentos) || 0,
        pagamentos: pagamentosPorPeriodo[key] || [],
      });
    }
  }

  periodos.sort((a, b) => {
    if (b.mes !== a.mes) return b.mes - a.mes;
    return (a.vendedor_nome || '').localeCompare(b.vendedor_nome || '');
  });

  const saldosVendedores = Object.values(saldoPorVendedor);
  const saldoTotal = round2(saldosVendedores.reduce((s, v) => s + v, 0));

  return {
    ano,
    resumo: {
      total_devido_ano: round2(periodos.reduce((s, p) => s + p.valor_devido, 0)),
      total_pago_ano: round2(periodos.reduce((s, p) => s + p.valor_pago, 0)),
      total_vendas_ano: round2(periodos.reduce((s, p) => s + p.total_vendas, 0)),
      saldo_total: saldoTotal,
    },
    periodos,
  };
}

async function salvarPagamentoComissaoPlanejado(data) {
  assertAcesso();

  const ano = Number(data.ano);
  const mes = Number(data.mes);
  const vendedorId = Number(data.vendedor_id);
  const valorPago = round2(data.valor_pago);
  const dataPagamento = String(data.data_pagamento || '').trim();

  if (!ano || !mes || mes < 1 || mes > 12) {
    throw new Error('Informe ano e mês válidos.');
  }
  if (!vendedorId) throw new Error('Informe o vendedor.');
  if (!Number.isFinite(valorPago) || valorPago < 0) {
    throw new Error('Informe o valor pago.');
  }
  if (!dataPagamento) throw new Error('Informe a data do pagamento.');

  const db = getPool();
  const devido = await db.query(`
    SELECT valor_comissao FROM comissao_planejado_mensal
    WHERE ano = $1 AND mes = $2 AND vendedor_id = $3
  `, [ano, mes, vendedorId]);

  const valorDevidoNaOcasiao = devido.rowCount > 0
    ? round2(devido.rows[0].valor_comissao)
    : 0;

  const formaPagamentoId = data.forma_pagamento_id ? Number(data.forma_pagamento_id) : null;
  let formaPagamento = String(data.forma_pagamento || '').trim() || null;
  if (formaPagamentoId) {
    const fp = await db.query('SELECT nome FROM formas_pagamento WHERE id = $1', [formaPagamentoId]);
    if (fp.rowCount > 0) formaPagamento = fp.rows[0].nome;
  }

  const result = await db.query(`
    INSERT INTO comissao_planejado_pagamentos (
      ano, mes, vendedor_id, valor_pago, valor_devido_na_ocasiao,
      data_pagamento, forma_pagamento, forma_pagamento_id, observacoes, atualizado_em
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    RETURNING *
  `, [
    ano, mes, vendedorId, valorPago, valorDevidoNaOcasiao,
    dataPagamento, formaPagamento, formaPagamentoId,
    data.observacoes?.trim() || null,
  ]);

  return mapPagamentoRow(result.rows[0]);
}

async function excluirPagamentoComissaoPlanejado(id) {
  assertAcesso();
  const db = getPool();
  const result = await db.query(
    'DELETE FROM comissao_planejado_pagamentos WHERE id = $1 RETURNING id',
    [id]
  );
  if (result.rowCount === 0) throw new Error('Pagamento não encontrado.');
  return { id };
}

module.exports = {
  sincronizarComissoesPlanejados,
  getControleMensalPlanejados,
  salvarPagamentoComissaoPlanejado,
  excluirPagamentoComissaoPlanejado,
};
