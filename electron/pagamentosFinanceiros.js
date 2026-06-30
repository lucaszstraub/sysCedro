const { getPool } = require('./database');
const { getSession, requireSession } = require('./auth');
const { userIsAdministrador } = require('./permissions');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function assertAcesso() {
  requireSession();
  if (!userIsAdministrador(getSession())) {
    throw new Error('Acesso restrito à administração do sistema.');
  }
}

function normalizarData(data) {
  const texto = String(data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new Error('Informe uma data de pagamento válida.');
  }
  return texto;
}

function normalizarAnoMes(filtros = {}) {
  const ano = filtros.ano != null && filtros.ano !== ''
    ? Number(filtros.ano)
    : null;
  const mes = filtros.mes != null && filtros.mes !== ''
    ? Number(filtros.mes)
    : null;

  if (ano != null && (ano < 2000 || ano > 2100)) {
    throw new Error('Informe um ano válido.');
  }
  if (mes != null && (mes < 1 || mes > 12)) {
    throw new Error('Informe um mês válido.');
  }

  return { ano, mes };
}

function mapCentroCusto(row) {
  return { ...row };
}

function mapPagamento(row) {
  const dataPagamento = row.data_pagamento instanceof Date
    ? row.data_pagamento.toISOString().slice(0, 10)
    : row.data_pagamento;
  return {
    ...row,
    valor: round2(row.valor),
    data_pagamento: dataPagamento,
  };
}

async function listCentrosCusto(busca = '', { incluirInativos = false } = {}) {
  assertAcesso();
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT cc.*,
      (
        SELECT COUNT(*)::int
        FROM pagamentos_financeiros pf
        WHERE pf.centro_custo_id = cc.id
      ) AS total_pagamentos
    FROM centros_custo cc
    WHERE ($2::boolean OR cc.ativo = true)
      AND ($1 = '' OR cc.nome ILIKE $1 OR COALESCE(cc.descricao, '') ILIKE $1)
    ORDER BY cc.ativo DESC, cc.nome
  `, [termo, incluirInativos]);
  return result.rows.map(mapCentroCusto);
}

async function getCentroCusto(id) {
  assertAcesso();
  const db = getPool();
  const result = await db.query('SELECT * FROM centros_custo WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new Error('Centro de custo não encontrado.');
  return mapCentroCusto(result.rows[0]);
}

async function createCentroCusto(data) {
  assertAcesso();
  const nome = data.nome?.trim();
  if (!nome) throw new Error('Informe o nome do centro de custo.');

  const db = getPool();
  const result = await db.query(`
    INSERT INTO centros_custo (nome, descricao)
    VALUES ($1, $2)
    RETURNING *
  `, [nome, data.descricao?.trim() || null]);
  return mapCentroCusto(result.rows[0]);
}

async function updateCentroCusto(id, data) {
  assertAcesso();
  const nome = data.nome?.trim();
  if (!nome) throw new Error('Informe o nome do centro de custo.');

  const db = getPool();
  const result = await db.query(`
    UPDATE centros_custo SET
      nome = $2,
      descricao = $3,
      ativo = COALESCE($4, ativo),
      atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    nome,
    data.descricao?.trim() || null,
    data.ativo == null ? null : !!data.ativo,
  ]);
  if (result.rowCount === 0) throw new Error('Centro de custo não encontrado.');
  return mapCentroCusto(result.rows[0]);
}

async function deleteCentroCusto(id) {
  assertAcesso();
  const db = getPool();
  const vinculos = await db.query(
    'SELECT COUNT(*)::int AS qtd FROM pagamentos_financeiros WHERE centro_custo_id = $1',
    [id]
  );
  if (Number(vinculos.rows[0]?.qtd) > 0) {
    const result = await db.query(`
      UPDATE centros_custo SET ativo = false, atualizado_em = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    if (result.rowCount === 0) throw new Error('Centro de custo não encontrado.');
    return mapCentroCusto(result.rows[0]);
  }

  const result = await db.query('DELETE FROM centros_custo WHERE id = $1 RETURNING *', [id]);
  if (result.rowCount === 0) throw new Error('Centro de custo não encontrado.');
  return mapCentroCusto(result.rows[0]);
}

async function listPagamentosFinanceiros(filtros = {}) {
  assertAcesso();
  const db = getPool();
  const busca = `%${filtros.busca || ''}%`;
  const { ano, mes } = normalizarAnoMes(filtros);
  const centroCustoId = filtros.centro_custo_id ? Number(filtros.centro_custo_id) : null;

  const result = await db.query(`
    SELECT
      pf.*,
      cc.nome AS centro_custo_nome,
      nf.numero AS nota_fiscal_numero,
      f.nome AS nota_fiscal_fornecedor,
      nfb.parcela AS nota_fiscal_parcela
    FROM pagamentos_financeiros pf
    JOIN centros_custo cc ON cc.id = pf.centro_custo_id
    LEFT JOIN nota_fiscal_boletos nfb ON nfb.id = pf.nota_fiscal_boleto_id
    LEFT JOIN notas_fiscais nf ON nf.id = nfb.nota_fiscal_id
    LEFT JOIN fornecedores f ON f.id = nf.fornecedor_id
    WHERE ($1 = '' OR pf.descricao ILIKE $1 OR cc.nome ILIKE $1 OR COALESCE(pf.observacoes, '') ILIKE $1)
      AND ($2::int IS NULL OR EXTRACT(YEAR FROM pf.data_pagamento)::int = $2)
      AND ($3::int IS NULL OR EXTRACT(MONTH FROM pf.data_pagamento)::int = $3)
      AND ($4::int IS NULL OR pf.centro_custo_id = $4)
    ORDER BY pf.data_pagamento DESC, pf.id DESC
  `, [busca, ano, mes, centroCustoId]);

  const itens = result.rows.map(mapPagamento);
  const total = round2(itens.reduce((sum, item) => sum + (Number(item.valor) || 0), 0));
  return { itens, total };
}

async function getPagamentoFinanceiro(id) {
  assertAcesso();
  const db = getPool();
  const result = await db.query(`
    SELECT pf.*, cc.nome AS centro_custo_nome
    FROM pagamentos_financeiros pf
    JOIN centros_custo cc ON cc.id = pf.centro_custo_id
    WHERE pf.id = $1
  `, [id]);
  if (result.rowCount === 0) throw new Error('Pagamento não encontrado.');
  return mapPagamento(result.rows[0]);
}

async function validarCentroCustoAtivo(client, centroCustoId) {
  const centro = await client.query(
    'SELECT id, nome, ativo FROM centros_custo WHERE id = $1',
    [centroCustoId]
  );
  if (centro.rowCount === 0) throw new Error('Centro de custo não encontrado.');
  if (!centro.rows[0].ativo) {
    throw new Error(`O centro de custo "${centro.rows[0].nome}" está inativo.`);
  }
  return centro.rows[0];
}

async function createPagamentoFinanceiro(data) {
  assertAcesso();
  const centroCustoId = Number(data.centro_custo_id);
  const descricao = data.descricao?.trim();
  const valor = round2(data.valor);
  const dataPagamento = normalizarData(data.data_pagamento);

  if (!centroCustoId) throw new Error('Selecione um centro de custo.');
  if (!descricao) throw new Error('Informe a descrição do pagamento.');
  if (valor <= 0) throw new Error('Informe um valor maior que zero.');

  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await validarCentroCustoAtivo(client, centroCustoId);
    const result = await client.query(`
      INSERT INTO pagamentos_financeiros (
        centro_custo_id, descricao, valor, data_pagamento, observacoes
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      centroCustoId,
      descricao,
      valor,
      dataPagamento,
      data.observacoes?.trim() || null,
    ]);
    await client.query('COMMIT');
    return getPagamentoFinanceiro(result.rows[0].id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updatePagamentoFinanceiro(id, data) {
  assertAcesso();
  const centroCustoId = Number(data.centro_custo_id);
  const descricao = data.descricao?.trim();
  const valor = round2(data.valor);
  const dataPagamento = normalizarData(data.data_pagamento);

  if (!centroCustoId) throw new Error('Selecione um centro de custo.');
  if (!descricao) throw new Error('Informe a descrição do pagamento.');
  if (valor <= 0) throw new Error('Informe um valor maior que zero.');

  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await validarCentroCustoAtivo(client, centroCustoId);
    const result = await client.query(`
      UPDATE pagamentos_financeiros SET
        centro_custo_id = $2,
        descricao = $3,
        valor = $4,
        data_pagamento = $5,
        observacoes = $6,
        atualizado_em = NOW()
      WHERE id = $1
      RETURNING id
    `, [
      id,
      centroCustoId,
      descricao,
      valor,
      dataPagamento,
      data.observacoes?.trim() || null,
    ]);
    if (result.rowCount === 0) throw new Error('Pagamento não encontrado.');
    await client.query('COMMIT');
    return getPagamentoFinanceiro(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deletePagamentoFinanceiro(id) {
  assertAcesso();
  const db = getPool();
  const result = await db.query(
    'DELETE FROM pagamentos_financeiros WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rowCount === 0) throw new Error('Pagamento não encontrado.');
  return mapPagamento(result.rows[0]);
}

module.exports = {
  listCentrosCusto,
  getCentroCusto,
  createCentroCusto,
  updateCentroCusto,
  deleteCentroCusto,
  listPagamentosFinanceiros,
  getPagamentoFinanceiro,
  createPagamentoFinanceiro,
  updatePagamentoFinanceiro,
  deletePagamentoFinanceiro,
};
