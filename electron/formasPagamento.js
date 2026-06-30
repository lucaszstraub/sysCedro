const { getPool } = require('./database');

async function ensureFormaAReceber() {
  const db = getPool();
  await db.query(`
    INSERT INTO formas_pagamento (nome, taxa_percentual)
    SELECT 'A receber', 0
    WHERE NOT EXISTS (
      SELECT 1 FROM formas_pagamento WHERE lower(trim(nome)) = 'a receber'
    )
  `);
}

async function listFormasPagamento(busca = '') {
  await ensureFormaAReceber();
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT id, nome, taxa_percentual, ativo, criado_em, atualizado_em
    FROM formas_pagamento
    WHERE ativo = true
      AND ($1 = '' OR nome ILIKE $1)
    ORDER BY nome
  `, [termo]);
  return result.rows;
}

async function listFormasPagamentoTodas(busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT id, nome, taxa_percentual, ativo, criado_em, atualizado_em
    FROM formas_pagamento
    WHERE $1 = '' OR nome ILIKE $1
    ORDER BY nome
  `, [termo]);
  return result.rows;
}

async function getFormaPagamento(id) {
  const db = getPool();
  const result = await db.query('SELECT * FROM formas_pagamento WHERE id = $1', [id]);
  return result.rows[0];
}

async function getFormasPagamentoMap(ids = []) {
  const unique = [...new Set(ids.filter(Boolean).map(Number))];
  if (unique.length === 0) return {};
  const db = getPool();
  const result = await db.query(
    'SELECT id, nome, taxa_percentual FROM formas_pagamento WHERE id = ANY($1::int[])',
    [unique]
  );
  return Object.fromEntries(result.rows.map((row) => [row.id, row]));
}

async function createFormaPagamento(data) {
  const db = getPool();
  if (!data.nome?.trim()) throw new Error('Informe o nome da forma de pagamento.');

  const taxa = Number(data.taxa_percentual) || 0;
  if (taxa < 0 || taxa > 100) {
    throw new Error('A taxa deve estar entre 0% e 100%.');
  }

  const result = await db.query(`
    INSERT INTO formas_pagamento (nome, taxa_percentual)
    VALUES ($1, $2)
    RETURNING *
  `, [data.nome.trim(), taxa]);
  return result.rows[0];
}

async function updateFormaPagamento(id, data) {
  const db = getPool();
  if (!data.nome?.trim()) throw new Error('Informe o nome da forma de pagamento.');

  const taxa = Number(data.taxa_percentual) || 0;
  if (taxa < 0 || taxa > 100) {
    throw new Error('A taxa deve estar entre 0% e 100%.');
  }

  const result = await db.query(`
    UPDATE formas_pagamento SET
      nome = $2,
      taxa_percentual = $3,
      atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, data.nome.trim(), taxa]);
  if (result.rowCount === 0) throw new Error('Forma de pagamento não encontrada.');
  return result.rows[0];
}

async function deleteFormaPagamento(id) {
  const db = getPool();
  const result = await db.query(
    'UPDATE formas_pagamento SET ativo = false, atualizado_em = NOW() WHERE id = $1 RETURNING id',
    [id]
  );
  if (result.rowCount === 0) throw new Error('Forma de pagamento não encontrada.');
  return { id };
}

module.exports = {
  listFormasPagamento,
  listFormasPagamentoTodas,
  getFormaPagamento,
  getFormasPagamentoMap,
  createFormaPagamento,
  updateFormaPagamento,
  deleteFormaPagamento,
};
