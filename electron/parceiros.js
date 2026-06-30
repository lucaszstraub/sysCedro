const { getPool } = require('./database');

async function listParceiros(busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT *
    FROM parceiros
    WHERE ativo = true
      AND (
        nome_completo ILIKE $1
        OR COALESCE(nome_escritorio, '') ILIKE $1
        OR COALESCE(telefone, '') ILIKE $1
        OR COALESCE(instagram, '') ILIKE $1
        OR COALESCE(chave_pix, '') ILIKE $1
      )
    ORDER BY nome_completo
  `, [termo]);
  return result.rows;
}

async function getParceiro(id) {
  const db = getPool();
  const result = await db.query('SELECT * FROM parceiros WHERE id = $1', [id]);
  return result.rows[0];
}

async function createParceiro(data) {
  const db = getPool();
  if (!data.nome_completo?.trim()) {
    throw new Error('Informe o nome completo do parceiro.');
  }

  const result = await db.query(`
    INSERT INTO parceiros (
      nome_completo, telefone, nome_escritorio, instagram, chave_pix, observacoes
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    data.nome_completo.trim(),
    data.telefone?.trim() || null,
    data.nome_escritorio?.trim() || null,
    data.instagram?.trim() || null,
    data.chave_pix?.trim() || null,
    data.observacoes?.trim() || null,
  ]);
  return result.rows[0];
}

async function updateParceiro(id, data) {
  const db = getPool();
  if (!data.nome_completo?.trim()) {
    throw new Error('Informe o nome completo do parceiro.');
  }

  const result = await db.query(`
    UPDATE parceiros SET
      nome_completo = $2,
      telefone = $3,
      nome_escritorio = $4,
      instagram = $5,
      chave_pix = $6,
      observacoes = $7,
      atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    data.nome_completo.trim(),
    data.telefone?.trim() || null,
    data.nome_escritorio?.trim() || null,
    data.instagram?.trim() || null,
    data.chave_pix?.trim() || null,
    data.observacoes?.trim() || null,
  ]);
  if (result.rowCount === 0) throw new Error('Parceiro não encontrado.');
  return result.rows[0];
}

async function deleteParceiro(id) {
  const db = getPool();
  const result = await db.query(
    'UPDATE parceiros SET ativo = false, atualizado_em = NOW() WHERE id = $1 RETURNING id',
    [id]
  );
  if (result.rowCount === 0) throw new Error('Parceiro não encontrado.');
  return { success: true };
}

module.exports = {
  listParceiros,
  getParceiro,
  createParceiro,
  updateParceiro,
  deleteParceiro,
};
