const { getPool } = require('./database');
const {
  hashPassword,
  getSession,
  requireSession,
  isAtribuicaoValida,
} = require('./auth');
const { userIsAdministrador } = require('./permissions');
const { ensureVendedorVinculado } = require('./vendedorUsuario');

function requireUserManagement() {
  requireSession();
  if (!userIsAdministrador(getSession())) {
    throw new Error('Acesso restrito à administração do sistema.');
  }
}

async function listUsuarios(busca = '') {
  requireUserManagement();
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT id, login, nome, atribuicao, is_master, ativo, vendedor_id, criado_em, atualizado_em
    FROM usuarios
    WHERE nome ILIKE $1 OR login ILIKE $1
    ORDER BY nome
  `, [termo]);
  return result.rows;
}

async function getUsuario(id) {
  requireUserManagement();
  const db = getPool();
  const result = await db.query(`
    SELECT id, login, nome, atribuicao, is_master, ativo, vendedor_id, criado_em, atualizado_em
    FROM usuarios WHERE id = $1
  `, [id]);
  return result.rows[0];
}

async function createUsuario(data) {
  requireUserManagement();
  const db = getPool();

  const login = data.login?.trim().toLowerCase();
  const nome = data.nome?.trim();
  const atribuicao = data.atribuicao;
  const senha = data.senha;

  if (!login) throw new Error('Informe o login do usuário.');
  if (!nome) throw new Error('Informe o nome do usuário.');
  if (!senha) throw new Error('Informe a senha do usuário.');
  if (!isAtribuicaoValida(atribuicao)) {
    throw new Error('Selecione uma atribuição válida.');
  }

  const duplicado = await db.query(
    'SELECT 1 FROM usuarios WHERE LOWER(login) = $1',
    [login]
  );
  if (duplicado.rowCount > 0) {
    throw new Error('Já existe um usuário com este login.');
  }

  const senhaHash = await hashPassword(senha);
  const result = await db.query(`
    INSERT INTO usuarios (login, senha_hash, nome, atribuicao, is_master, ativo)
    VALUES ($1, $2, $3, $4, false, $5)
    RETURNING id, login, nome, atribuicao, is_master, ativo, criado_em, atualizado_em
  `, [login, senhaHash, nome, atribuicao, data.ativo !== false]);

  await ensureVendedorVinculado(result.rows[0].id);
  const refreshed = await getUsuario(result.rows[0].id);
  return refreshed;
}

async function updateUsuario(id, data) {
  requireUserManagement();
  const db = getPool();
  const session = getSession();

  const atual = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Usuário não encontrado.');
  const usuario = atual.rows[0];

  const login = data.login?.trim().toLowerCase();
  const nome = data.nome?.trim();
  const atribuicao = data.atribuicao;

  if (!login) throw new Error('Informe o login do usuário.');
  if (!nome) throw new Error('Informe o nome do usuário.');
  if (!isAtribuicaoValida(atribuicao)) {
    throw new Error('Selecione uma atribuição válida.');
  }

  if (usuario.is_master && !session.is_master) {
    throw new Error('Apenas o usuário master pode alterar o cadastro master.');
  }

  const duplicado = await db.query(
    'SELECT 1 FROM usuarios WHERE LOWER(login) = $1 AND id <> $2',
    [login, id]
  );
  if (duplicado.rowCount > 0) {
    throw new Error('Já existe um usuário com este login.');
  }

  const ativo = usuario.is_master ? true : data.ativo !== false;
  const params = [id, login, nome, atribuicao, ativo];
  let senhaSql = '';

  if (data.senha?.trim()) {
    const senhaHash = await hashPassword(data.senha.trim());
    params.push(senhaHash);
    senhaSql = `, senha_hash = $${params.length}`;
  }

  await db.query(`
    UPDATE usuarios SET
      login = $2,
      nome = $3,
      atribuicao = $4,
      ativo = $5,
      atualizado_em = NOW()
      ${senhaSql}
    WHERE id = $1
    RETURNING id, login, nome, atribuicao, is_master, ativo, criado_em, atualizado_em
  `, params);

  await ensureVendedorVinculado(id);
  return getUsuario(id);
}

async function deleteUsuario(id) {
  requireUserManagement();
  const db = getPool();
  const session = getSession();

  const atual = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Usuário não encontrado.');

  const usuario = atual.rows[0];
  if (usuario.is_master) {
    throw new Error('O usuário master não pode ser desativado.');
  }
  if (Number(session.id) === Number(id)) {
    throw new Error('Você não pode desativar o próprio usuário.');
  }

  await db.query('UPDATE usuarios SET ativo = false, atualizado_em = NOW() WHERE id = $1', [id]);
  return { success: true };
}

module.exports = {
  listUsuarios,
  getUsuario,
  createUsuario,
  updateUsuario,
  deleteUsuario,
};
