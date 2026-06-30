const { getPool } = require('./database');
const { getSession } = require('./auth');
const { userIsAdministrador } = require('./permissions');
const { sincronizarComissoes } = require('./comissaoVendas');

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

function mesReferenciaFromAnoMes(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

async function obterVendedorasDivisao(db) {
  const colaboradoras = await db.query(`
    SELECT id, nome
    FROM colaboradores
    WHERE funcao = 'vendedor' AND ativo = true
    ORDER BY nome
  `);

  if (colaboradoras.rowCount > 0) {
    return {
      qtd: colaboradoras.rowCount,
      nomes: colaboradoras.rows.map((r) => r.nome),
      fonte: 'colaboradores',
    };
  }

  const vendedores = await db.query(`
    SELECT DISTINCT v.id, v.nome
    FROM vendedores v
    LEFT JOIN usuarios u ON u.vendedor_id = v.id OR u.id = v.usuario_id
    WHERE v.ativo = true
      AND v.classificacao = 'moveis_soltos'
      AND COALESCE(u.atribuicao, 'vendedor') = 'vendedor'
    ORDER BY v.nome
  `);

  return {
    qtd: vendedores.rowCount,
    nomes: vendedores.rows.map((r) => r.nome),
    fonte: vendedores.rowCount > 0 ? 'vendedores' : null,
  };
}

function calcularValorPorVendedora(valorTotal, qtdVendedoras) {
  if (!qtdVendedoras || qtdVendedoras <= 0) return null;
  return round2(valorTotal / qtdVendedoras);
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

async function calcularValorDevidoMes(client, ano, mes, perfil) {
  const mesRef = mesReferenciaFromAnoMes(ano, mes);
  const result = await client.query(`
    SELECT COALESCE(SUM(vc.valor_comissao), 0) AS total
    FROM venda_comissoes vc
    JOIN vendas v ON v.id = vc.venda_id
    WHERE vc.perfil_comissao = $1
      AND v.status IN ('confirmada', 'entregue')
      AND date_trunc('month', v.criado_em)::date = $2::date
  `, [perfil, mesRef]);
  return round2(result.rows[0].total);
}

async function getControleMensalComissoes(filtros = {}) {
  assertAcesso();
  await sincronizarComissoes();

  const ano = Number(filtros.ano) || new Date().getFullYear();
  const db = getPool();
  const vendedorasDivisao = await obterVendedorasDivisao(db);

  const devidos = await db.query(`
    SELECT
      EXTRACT(YEAR FROM v.criado_em)::int AS ano,
      EXTRACT(MONTH FROM v.criado_em)::int AS mes,
      vc.perfil_comissao,
      COALESCE(SUM(vc.valor_comissao), 0) AS valor_devido,
      COUNT(*)::int AS qtd_lancamentos
    FROM venda_comissoes vc
    JOIN vendas v ON v.id = vc.venda_id
    WHERE v.status IN ('confirmada', 'entregue')
      AND EXTRACT(YEAR FROM v.criado_em)::int = $1
    GROUP BY 1, 2, 3
    ORDER BY 2, 3
  `, [ano]);

  const pagos = await db.query(`
    SELECT
      ano, mes, perfil_comissao,
      COALESCE(SUM(valor_pago), 0) AS valor_pago,
      COUNT(*)::int AS qtd_pagamentos
    FROM comissao_pagamentos
    WHERE ano = $1
    GROUP BY 1, 2, 3
  `, [ano]);

  const ajustes = await db.query(`
    SELECT
      EXTRACT(YEAR FROM ca.mes_referencia)::int AS ano,
      EXTRACT(MONTH FROM ca.mes_referencia)::int AS mes,
      ca.perfil_comissao,
      COALESCE(SUM(ca.diferenca), 0) AS total_ajustes,
      COUNT(*)::int AS qtd_ajustes
    FROM comissao_ajustes ca
    WHERE EXTRACT(YEAR FROM ca.mes_referencia)::int = $1
    GROUP BY 1, 2, 3
  `, [ano]);

  const pagamentosDetalhe = await db.query(`
    SELECT cp.*, fp.nome AS forma_pagamento_nome
    FROM comissao_pagamentos cp
    LEFT JOIN formas_pagamento fp ON fp.id = cp.forma_pagamento_id
    WHERE cp.ano = $1
    ORDER BY cp.data_pagamento DESC, cp.id DESC
  `, [ano]);

  const devidoMap = {};
  for (const row of devidos.rows) {
    devidoMap[`${periodoKey(row.ano, row.mes)}:${row.perfil_comissao}`] = row;
  }

  const pagoMap = {};
  for (const row of pagos.rows) {
    pagoMap[`${periodoKey(row.ano, row.mes)}:${row.perfil_comissao}`] = row;
  }

  const ajusteMap = {};
  for (const row of ajustes.rows) {
    ajusteMap[`${periodoKey(row.ano, row.mes)}:${row.perfil_comissao}`] = row;
  }

  const pagamentosPorPeriodo = {};
  for (const row of pagamentosDetalhe.rows) {
    const key = `${periodoKey(row.ano, row.mes)}:${row.perfil_comissao}`;
    if (!pagamentosPorPeriodo[key]) pagamentosPorPeriodo[key] = [];
    pagamentosPorPeriodo[key].push(mapPagamentoRow(row));
  }

  const saldoPorPerfil = { vendedor: 0, gerente: 0 };
  const periodos = [];

  for (let mes = 1; mes <= 12; mes += 1) {
    for (const perfil of ['vendedor', 'gerente']) {
      const key = `${periodoKey(ano, mes)}:${perfil}`;
      const dev = devidoMap[key];
      const pag = pagoMap[key];
      const aj = ajusteMap[key];

      const valorDevido = round2(dev?.valor_devido || 0);
      const valorPago = round2(pag?.valor_pago || 0);
      const saldoAnterior = round2(saldoPorPerfil[perfil]);
      const diferencaMes = round2(valorPago - valorDevido);
      const saldoAcumulado = round2(saldoAnterior + diferencaMes);
      saldoPorPerfil[perfil] = saldoAcumulado;

      const liquidoAPagar = round2(valorDevido - valorPago - saldoAnterior);

      if (
        valorDevido > 0
        || valorPago > 0
        || (aj?.qtd_ajustes || 0) > 0
        || Math.abs(saldoAnterior) >= 0.01
      ) {
        const periodo = {
          ano,
          mes,
          mes_label: MESES_LABEL[mes],
          perfil_comissao: perfil,
          valor_devido: valorDevido,
          valor_pago: valorPago,
          diferenca_mes: diferencaMes,
          saldo_anterior: saldoAnterior,
          saldo_acumulado: saldoAcumulado,
          liquido_a_pagar: liquidoAPagar,
          qtd_lancamentos: Number(dev?.qtd_lancamentos) || 0,
          qtd_pagamentos: Number(pag?.qtd_pagamentos) || 0,
          total_ajustes: round2(aj?.total_ajustes || 0),
          qtd_ajustes: Number(aj?.qtd_ajustes) || 0,
          pagamentos: pagamentosPorPeriodo[key] || [],
        };

        if (perfil === 'vendedor') {
          periodo.qtd_vendedoras = vendedorasDivisao.qtd;
          periodo.valor_por_vendedora = calcularValorPorVendedora(
            valorDevido,
            vendedorasDivisao.qtd
          );
          periodo.vendedoras_nomes = vendedorasDivisao.nomes;
        }

        periodos.push(periodo);
      }
    }
  }

  const countGerente = await db.query(`
    SELECT COUNT(*)::int AS qtd
    FROM venda_comissoes
    WHERE perfil_comissao = 'gerente'
  `);
  const countVendedor = await db.query(`
    SELECT COUNT(*)::int AS qtd
    FROM venda_comissoes
    WHERE perfil_comissao = 'vendedor'
  `);
  const regraGerente = await db.query(`
    SELECT beneficiario_vendedor_id FROM comissao_regras WHERE perfil = 'gerente'
  `);

  const qtdGerente = Number(countGerente.rows[0]?.qtd) || 0;
  const qtdVendedor = Number(countVendedor.rows[0]?.qtd) || 0;
  let avisoGerente = null;
  if (regraGerente.rowCount === 0) {
    avisoGerente = 'Regra de comissão da gerência não cadastrada. Salve a regra em Regras comissão — soltos.';
  } else if (qtdGerente === 0 && qtdVendedor > 0) {
    avisoGerente = 'Nenhuma comissão de gerência gerada. Verifique se os produtos têm custo real e se a regra da gerência está salva.';
  }

  let avisoVendedoras = null;
  if (vendedorasDivisao.qtd === 0 && qtdVendedor > 0) {
    avisoVendedoras = 'Cadastre vendedoras no Quadro de colaboradores (função Vendedor) para calcular a divisão individual da comissão.';
  }

  return {
    ano,
    resumo: {
      saldo_vendedor: saldoPorPerfil.vendedor,
      saldo_gerente: saldoPorPerfil.gerente,
      total_devido_ano: round2(periodos.reduce((s, p) => s + p.valor_devido, 0)),
      total_pago_ano: round2(periodos.reduce((s, p) => s + p.valor_pago, 0)),
      total_devido_gerente_ano: round2(
        periodos.filter((p) => p.perfil_comissao === 'gerente').reduce((s, p) => s + p.valor_devido, 0)
      ),
      total_devido_vendedor_ano: round2(
        periodos.filter((p) => p.perfil_comissao === 'vendedor').reduce((s, p) => s + p.valor_devido, 0)
      ),
      qtd_lancamentos_gerente: qtdGerente,
      qtd_lancamentos_vendedor: qtdVendedor,
      aviso_gerente: avisoGerente,
      aviso_vendedoras: avisoVendedoras,
      qtd_vendedoras_divisao: vendedorasDivisao.qtd,
      vendedoras_divisao_nomes: vendedorasDivisao.nomes,
      valor_medio_vendedor_ano: calcularValorPorVendedora(
        round2(
          periodos
            .filter((p) => p.perfil_comissao === 'vendedor')
            .reduce((s, p) => s + p.valor_devido, 0)
        ),
        vendedorasDivisao.qtd
      ),
    },
    periodos,
  };
}

async function listAjustesComissaoMes(filtros = {}) {
  assertAcesso();
  const ano = Number(filtros.ano);
  const mes = Number(filtros.mes);
  const perfil = filtros.perfilComissao;

  if (!ano || !mes || !['vendedor', 'gerente'].includes(perfil)) {
    throw new Error('Informe ano, mês e perfil para listar ajustes.');
  }

  const mesRef = mesReferenciaFromAnoMes(ano, mes);
  const db = getPool();
  const result = await db.query(`
    SELECT
      ca.*,
      ben.nome AS beneficiario_nome,
      v.numero AS venda_numero,
      v.numero_pedido,
      vi.descricao AS item_descricao
    FROM comissao_ajustes ca
    LEFT JOIN vendedores ben ON ben.id = ca.beneficiario_vendedor_id
    LEFT JOIN vendas v ON v.id = ca.venda_id
    LEFT JOIN venda_itens vi ON vi.id = ca.venda_item_id
    WHERE ca.mes_referencia = $1::date
      AND ca.perfil_comissao = $2
    ORDER BY ca.criado_em DESC, ca.id DESC
    LIMIT 500
  `, [mesRef, perfil]);

  return result.rows.map((row) => ({
    ...row,
    valor_anterior: row.valor_anterior != null ? round2(row.valor_anterior) : null,
    valor_novo: round2(row.valor_novo),
    diferenca: round2(row.diferenca),
  }));
}

async function salvarPagamentoComissao(data) {
  assertAcesso();

  const ano = Number(data.ano);
  const mes = Number(data.mes);
  const perfil = data.perfil_comissao;
  const valorPago = round2(data.valor_pago);
  const dataPagamento = String(data.data_pagamento || '').trim();

  if (!ano || !mes || mes < 1 || mes > 12) {
    throw new Error('Informe ano e mês válidos.');
  }
  if (!['vendedor', 'gerente'].includes(perfil)) {
    throw new Error('Perfil de comissão inválido.');
  }
  if (!Number.isFinite(valorPago) || valorPago < 0) {
    throw new Error('Informe o valor pago.');
  }
  if (!dataPagamento) {
    throw new Error('Informe a data do pagamento.');
  }

  const db = getPool();
  const client = await db.connect();
  try {
    const valorDevidoNaOcasiao = await calcularValorDevidoMes(client, ano, mes, perfil);

    const formaPagamentoId = data.forma_pagamento_id
      ? Number(data.forma_pagamento_id)
      : null;
    let formaPagamento = String(data.forma_pagamento || '').trim() || null;

    if (formaPagamentoId) {
      const fp = await client.query('SELECT nome FROM formas_pagamento WHERE id = $1', [formaPagamentoId]);
      if (fp.rowCount > 0) formaPagamento = fp.rows[0].nome;
    }

    const result = await client.query(`
      INSERT INTO comissao_pagamentos (
        ano, mes, perfil_comissao, valor_pago, valor_devido_na_ocasiao,
        data_pagamento, forma_pagamento, forma_pagamento_id, observacoes, atualizado_em
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `, [
      ano,
      mes,
      perfil,
      valorPago,
      valorDevidoNaOcasiao,
      dataPagamento,
      formaPagamento,
      formaPagamentoId,
      data.observacoes?.trim() || null,
    ]);

    return mapPagamentoRow(result.rows[0]);
  } finally {
    client.release();
  }
}

async function excluirPagamentoComissao(id) {
  assertAcesso();
  const db = getPool();
  const result = await db.query('DELETE FROM comissao_pagamentos WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) throw new Error('Pagamento não encontrado.');
  return { id };
}

module.exports = {
  getControleMensalComissoes,
  listAjustesComissaoMes,
  salvarPagamentoComissao,
  excluirPagamentoComissao,
};
