const { scrypt, randomBytes, timingSafeEqual } = require('crypto');
const { promisify } = require('util');
const { getPool } = require('./database');
const {
  userHasPermission,
  userHasAnyPermission,
  isAtribuicaoValida,
  ATRIBUICOES,
} = require('./permissions');

const scryptAsync = promisify(scrypt);

let currentSession = null;

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    login: row.login,
    nome: row.nome,
    atribuicao: row.atribuicao,
    is_master: Boolean(row.is_master),
    ativo: Boolean(row.ativo),
    vendedor_id: row.vendedor_id ? Number(row.vendedor_id) : null,
  };
}

async function finalizeSession(userRow) {
  const { ensureVendedorVinculado } = require('./vendedorUsuario');
  const linked = await ensureVendedorVinculado(userRow.id);
  return sanitizeUser(linked || userRow);
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const derived = await scryptAsync(password, salt, 64);
  const hashBuf = Buffer.from(hash, 'hex');
  return timingSafeEqual(derived, hashBuf);
}

async function ensureMasterUser() {
  const db = getPool();
  const existing = await db.query(
    "SELECT id FROM usuarios WHERE login = 'master' LIMIT 1"
  );
  if (existing.rowCount > 0) return;

  const senhaHash = await hashPassword('12345');
  await db.query(`
    INSERT INTO usuarios (login, senha_hash, nome, atribuicao, is_master, ativo)
    VALUES ('master', $1, 'Master', $2, true, true)
  `, [senhaHash, ATRIBUICOES.ADMINISTRACAO]);
}

function getSession() {
  return currentSession;
}

function requireSession() {
  if (!currentSession) {
    throw new Error('Faça login para continuar.');
  }
}

function assertChannelAccess(channel) {
  const { getChannelRequirement } = require('./permissions');
  const requirement = getChannelRequirement(channel);

  if (requirement.type === 'public') return;

  requireSession();

  if (requirement.type === 'session') return;

  if (requirement.type === 'single') {
    if (!userHasPermission(currentSession, requirement.permission)) {
      throw new Error('Você não tem permissão para esta ação.');
    }
    return;
  }

  if (requirement.type === 'any') {
    if (!userHasAnyPermission(currentSession, requirement.permissions)) {
      throw new Error('Você não tem permissão para esta ação.');
    }
    return;
  }

  if (requirement.type === 'administracao') {
    const { userIsAdministrador } = require('./permissions');
    if (!userIsAdministrador(currentSession)) {
      throw new Error('Acesso restrito à administração do sistema.');
    }
  }
}

async function login(login, senha) {
  const db = getPool();
  const normalizedLogin = login?.trim().toLowerCase();
  if (!normalizedLogin || !senha) {
    throw new Error('Informe login e senha.');
  }

  const result = await db.query(
    'SELECT * FROM usuarios WHERE LOWER(login) = $1 AND ativo = true',
    [normalizedLogin]
  );
  if (result.rowCount === 0) {
    throw new Error('Login ou senha inválidos.');
  }

  const user = result.rows[0];
  const valid = await verifyPassword(senha, user.senha_hash);
  if (!valid) {
    throw new Error('Login ou senha inválidos.');
  }

  currentSession = await finalizeSession(user);
  return currentSession;
}

async function restoreSession(userId) {
  const db = getPool();
  const result = await db.query(
    'SELECT * FROM usuarios WHERE id = $1 AND ativo = true',
    [userId]
  );
  if (result.rowCount === 0) {
    throw new Error('Sessão inválida.');
  }

  currentSession = await finalizeSession(result.rows[0]);
  return currentSession;
}

function logout() {
  currentSession = null;
  return { success: true };
}

module.exports = {
  hashPassword,
  verifyPassword,
  ensureMasterUser,
  sanitizeUser,
  getSession,
  requireSession,
  assertChannelAccess,
  login,
  restoreSession,
  logout,
  userHasPermission,
  userHasAnyPermission,
  isAtribuicaoValida,
};
