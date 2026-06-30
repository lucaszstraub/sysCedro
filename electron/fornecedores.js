const { getPool } = require('./database');

async function listFornecedores(busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT * FROM fornecedores
    WHERE ativo = true
      AND (
        nome ILIKE $1
        OR COALESCE(localizacao, '') ILIKE $1
        OR COALESCE(representante_nome, '') ILIKE $1
        OR COALESCE(representante_contato, '') ILIKE $1
      )
    ORDER BY nome
  `, [termo]);
  return result.rows;
}

async function getFornecedor(id) {
  const db = getPool();
  const result = await db.query('SELECT * FROM fornecedores WHERE id = $1', [id]);
  return result.rows[0];
}

async function createFornecedor(data) {
  const db = getPool();
  if (!data.nome?.trim()) throw new Error('Informe o nome do fornecedor.');

  const result = await db.query(`
    INSERT INTO fornecedores (
      nome, localizacao, representante_nome, representante_contato
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [
    data.nome.trim(),
    data.localizacao?.trim() || null,
    data.representante_nome?.trim() || null,
    data.representante_contato?.trim() || null,
  ]);
  return result.rows[0];
}

async function updateFornecedor(id, data) {
  const db = getPool();
  if (!data.nome?.trim()) throw new Error('Informe o nome do fornecedor.');

  const result = await db.query(`
    UPDATE fornecedores SET
      nome = $2,
      localizacao = $3,
      representante_nome = $4,
      representante_contato = $5
    WHERE id = $1
    RETURNING *
  `, [
    id,
    data.nome.trim(),
    data.localizacao?.trim() || null,
    data.representante_nome?.trim() || null,
    data.representante_contato?.trim() || null,
  ]);
  if (result.rowCount === 0) throw new Error('Fornecedor não encontrado.');
  return result.rows[0];
}

async function deleteFornecedor(id) {
  const db = getPool();
  const emUso = await db.query(
    'SELECT 1 FROM produtos WHERE fornecedor_id = $1 AND ativo = true LIMIT 1',
    [id]
  );
  if (emUso.rowCount > 0) {
    throw new Error('Não é possível desativar: existem produtos vinculados a este fornecedor.');
  }

  const result = await db.query(
    'UPDATE fornecedores SET ativo = false WHERE id = $1 RETURNING id',
    [id]
  );
  if (result.rowCount === 0) throw new Error('Fornecedor não encontrado.');
  return { success: true };
}

module.exports = {
  listFornecedores,
  getFornecedor,
  createFornecedor,
  updateFornecedor,
  deleteFornecedor,
};
