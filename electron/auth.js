const { scrypt, randomBytes, timingSafeEqual, createHmac } = require('crypto');
const { promisify } = require('util');
const { AsyncLocalStorage } = require('async_hooks');
const { getPool } = require('./database');
const {
  userHasPermission,
  userHasAnyPermission,
  isAtribuicaoValida,
  ATRIBUICOES,
} = require('./permissions');

const scryptAsync = promisify(scrypt);
const sessionAls = new AsyncLocalStorage();

/** Sessão única do processo Electron (desktop). */
let currentSession = null;

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isWebRuntime() {
  return process.env.SYS_CEDRO_WEB === '1' || process.env.VERCEL === '1';
}

function getSessionSecret() {
  return process.env.SESSION_SECRET
    || process.env.SYS_CEDRO_SESSION_SECRET
    || 'syscedro-dev-secret-change-me';
}

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

function signSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    user,
    exp: Date.now() + SESSION_TTL_MS,
  })).toString('base64url');
  const sig = createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.user?.id || !data.exp || data.exp < Date.now()) return null;
    return sanitizeUser(data.user);
  } catch {
    return null;
  }
}

function getSession() {
  const store = sessionAls.getStore();
  if (store && Object.prototype.hasOwnProperty.call(store, 'session')) {
    return store.session;
  }
  return currentSession;
}

function runWithSession(session, fn) {
  return sessionAls.run({ session }, fn);
}

function requireSession() {
  if (!getSession()) {
    throw new Error('Faça login para continuar.');
  }
}

function assertChannelAccess(channel) {
  const { assertOfflineAllowsChannel } = require('./offlineMode');
  assertOfflineAllowsChannel(channel);

  const { getChannelRequirement } = require('./permissions');
  const requirement = getChannelRequirement(channel);

  if (requirement.type === 'public') return;

  requireSession();

  if (requirement.type === 'session') return;

  if (requirement.type === 'single') {
    if (!userHasPermission(getSession(), requirement.permission)) {
      throw new Error('Você não tem permissão para esta ação.');
    }
    return;
  }

  if (requirement.type === 'any') {
    if (!userHasAnyPermission(getSession(), requirement.permissions)) {
      throw new Error('Você não tem permissão para esta ação.');
    }
    return;
  }

  if (requirement.type === 'administracao') {
    const { userIsAdministrador } = require('./permissions');
    if (!userIsAdministrador(getSession())) {
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

  const sessionUser = await finalizeSession(user);

  if (isWebRuntime()) {
    const token = signSessionToken(sessionUser);
    return { ...sessionUser, token };
  }

  currentSession = sessionUser;
  return currentSession;
}

async function restoreSession(userId, token) {
  if (token) {
    const fromToken = verifySessionToken(token);
    if (fromToken && Number(fromToken.id) === Number(userId)) {
      if (isWebRuntime()) {
        const refreshed = signSessionToken(fromToken);
        return { ...fromToken, token: refreshed };
      }
      currentSession = fromToken;
      return currentSession;
    }
  }

  const db = getPool();
  const result = await db.query(
    'SELECT * FROM usuarios WHERE id = $1 AND ativo = true',
    [userId]
  );
  if (result.rowCount === 0) {
    throw new Error('Sessão inválida.');
  }

  const sessionUser = await finalizeSession(result.rows[0]);

  if (isWebRuntime()) {
    const newToken = signSessionToken(sessionUser);
    return { ...sessionUser, token: newToken };
  }

  currentSession = sessionUser;
  return currentSession;
}

function logout() {
  const store = sessionAls.getStore();
  if (store) store.session = null;
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
  runWithSession,
  verifySessionToken,
  signSessionToken,
  isWebRuntime,
};
