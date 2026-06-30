const { getPool } = require('./database');

async function listClientes(busca = '') {
  const db = getPool();
  const result = await db.query(`
    SELECT * FROM clientes
    WHERE ativo = true
      AND ($1 = '' OR nome ILIKE $1 OR cpf_cnpj ILIKE $1 OR email ILIKE $1
           OR telefone ILIKE $1 OR cidade ILIKE $1 OR endereco ILIKE $1)
    ORDER BY nome
  `, [`%${busca}%`]);
  return result.rows;
}

async function getCliente(id) {
  const db = getPool();
  const result = await db.query('SELECT * FROM clientes WHERE id = $1', [id]);
  return result.rows[0];
}

async function createCliente(data) {
  const db = getPool();
  const result = await db.query(`
    INSERT INTO clientes (nome, cpf_cnpj, telefone, email, endereco, cidade, estado, cep, observacoes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    data.nome,
    data.cpf_cnpj || null,
    data.telefone || null,
    data.email || null,
    data.endereco || null,
    data.cidade || null,
    data.estado || null,
    data.cep || null,
    data.observacoes || null,
  ]);
  return result.rows[0];
}

async function updateCliente(id, data) {
  const db = getPool();
  const result = await db.query(`
    UPDATE clientes SET
      nome = $2, cpf_cnpj = $3, telefone = $4, email = $5,
      endereco = $6, cidade = $7, estado = $8, cep = $9, observacoes = $10
    WHERE id = $1
    RETURNING *
  `, [
    id,
    data.nome,
    data.cpf_cnpj || null,
    data.telefone || null,
    data.email || null,
    data.endereco || null,
    data.cidade || null,
    data.estado || null,
    data.cep || null,
    data.observacoes || null,
  ]);
  return result.rows[0];
}

module.exports = {
  listClientes,
  getCliente,
  createCliente,
  updateCliente,
};
