const { getPool, isHybridMode } = require('./database');
const { isOfflineMode } = require('./offlineMode');
const { allocateOfflineId } = require('./dbSync');
const { validarClienteCadastro } = require('./clienteValidacao');

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
  validarClienteCadastro(data);
  const db = getPool();
  const offline = isOfflineMode();
  const pendenteSync = isHybridMode() && offline;
  let newId = null;
  if (offline) {
    newId = await allocateOfflineId(db);
  }

  const result = newId
    ? await db.query(`
      INSERT INTO clientes (
        id, nome, cpf_cnpj, telefone, email, endereco, cidade, estado, cep, observacoes, pendente_sync
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      newId, data.nome, data.cpf_cnpj || null, data.telefone || null, data.email || null,
      data.endereco || null, data.cidade || null, data.estado || null, data.cep || null,
      data.observacoes || null, pendenteSync,
    ])
    : await db.query(`
      INSERT INTO clientes (
        nome, cpf_cnpj, telefone, email, endereco, cidade, estado, cep, observacoes, pendente_sync
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
      RETURNING *
    `, [
      data.nome, data.cpf_cnpj || null, data.telefone || null, data.email || null,
      data.endereco || null, data.cidade || null, data.estado || null, data.cep || null,
      data.observacoes || null,
    ]);

  return result.rows[0];
}

async function updateCliente(id, data) {
  validarClienteCadastro(data);
  const db = getPool();
  const pendenteSync = isHybridMode() && isOfflineMode();
  const result = await db.query(`
    UPDATE clientes SET
      nome = $2, cpf_cnpj = $3, telefone = $4, email = $5,
      endereco = $6, cidade = $7, estado = $8, cep = $9, observacoes = $10,
      pendente_sync = $11
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
    pendenteSync,
  ]);

  return result.rows[0];
}

module.exports = {
  listClientes,
  getCliente,
  createCliente,
  updateCliente,
};
