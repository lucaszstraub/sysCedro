const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dbSync = require('./dbSync');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const eq = trimmed.indexOf('=');
    if (eq === -1) return;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function isHybridMode() {
  return dbSync.isHybridMode();
}

function isCloudAvailable() {
  return dbSync.isCloudAvailable();
}

function getSyncStatus() {
  return dbSync.getLastSyncSummary();
}

function isCloudDatabase() {
  if (isHybridMode()) return true;
  if (isTruthy(process.env.DB_CLOUD)) return true;
  const url = process.env.DATABASE_URL || '';
  const host = process.env.DB_HOST || '';
  return url.includes('supabase') || host.includes('pooler.supabase');
}

function getProjectRef() {
  const url = process.env.SUPABASE_URL || '';
  const match = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  if (match) return match[1];

  const user = process.env.DB_USER || '';
  const userMatch = user.match(/^postgres\.(.+)$/);
  if (userMatch) return userMatch[1];

  return 'gzveuamcqokfbgyvxbed';
}

function getDatabasePassword() {
  if (process.env.DB_PASSWORD) return process.env.DB_PASSWORD;
  const url = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL || '';
  if (!url) return '';
  try {
    return decodeURIComponent(new URL(url).password);
  } catch (_) {
    return '';
  }
}

function poolerHostCandidates() {
  const regions = [
    'sa-east-1', 'us-east-1', 'us-east-2', 'us-west-1', 'eu-west-1',
    'eu-central-1', 'ap-southeast-1', 'ap-northeast-1',
  ];
  const hosts = [];
  for (const region of regions) {
    for (let i = 0; i <= 5; i += 1) {
      hosts.push(`aws-${i}-${region}.pooler.supabase.com`);
    }
  }
  return hosts;
}

async function discoverPoolerConfig() {
  const ref = getProjectRef();
  const password = getDatabasePassword();
  if (!password) {
    throw new Error('Defina DB_PASSWORD no .env com a senha do banco Supabase.');
  }

  const user = `postgres.${ref}`;
  const ports = [5432, 6543];
  const hosts = poolerHostCandidates();

  let lastError = null;
  for (const host of hosts) {
    for (const port of ports) {
      const pool = new Pool({
        host,
        port,
        user,
        password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      try {
        await pool.query('SELECT 1');
        await pool.end();
        console.log(`[database] Pooler encontrado: ${host}:${port}`);
        return {
          host,
          port,
          user,
          password,
          database: 'postgres',
          ssl: { rejectUnauthorized: false },
        };
      } catch (err) {
        lastError = err;
        try { await pool.end(); } catch (_) {}
      }
    }
  }

  throw new Error(
    `${lastError?.message || 'Sem conexão'}\n\n`
    + 'Não foi possível achar o pooler automaticamente.\n'
    + 'No painel Supabase: Connect → Session pooler → copie a URI para DATABASE_POOLER_URL no .env.'
  );
}

function buildPoolConfig() {
  const poolerUrl = process.env.DATABASE_POOLER_URL;
  if (poolerUrl) {
    return {
      connectionString: poolerUrl,
      ssl: { rejectUnauthorized: false },
    };
  }

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: isTruthy(process.env.DB_SSL) || process.env.DATABASE_URL.includes('supabase')
        ? { rejectUnauthorized: false }
        : undefined,
    };
  }

  if (process.env.DB_HOST) {
    return {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'postgres',
      ssl: isTruthy(process.env.DB_SSL) ? { rejectUnauthorized: false } : undefined,
    };
  }

  if (isCloudDatabase()) {
    return null;
  }

  return {
    host: 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'sys_cedro_wms',
    ssl: isTruthy(process.env.DB_SSL) ? { rejectUnauthorized: false } : undefined,
  };
}

function cloudConnectionHelp(error) {
  const code = error?.code || '';
  const host = process.env.DB_HOST || process.env.DATABASE_URL || '';
  if (code !== 'ENOTFOUND' && !String(error?.message || '').includes('ENOTFOUND')) return '';

  if (host.includes('db.') && host.includes('.supabase.co')) {
    return [
      '',
      'Sua rede não alcança o host direto db.*.supabase.co (somente IPv6).',
      'Use o Session pooler (IPv4) do painel Supabase:',
      '  1. Project → Connect → Session pooler',
      '  2. Copie Host e URI, ou preencha no .env:',
      '     DATABASE_POOLER_URL=postgresql://postgres.gzveuamcqokfbgyvxbed:SENHA@HOST:5432/postgres',
      '  3. O host costuma ser aws-N-REGIAO.pooler.supabase.com (copie do painel, não invente)',
      '',
    ].join('\n');
  }

  return '';
}

async function shouldRunSchema(db) {
  if (!isCloudDatabase()) return true;
  const result = await db.query(`
    SELECT to_regclass('public.produtos') IS NOT NULL AS schema_pronto
  `);
  return !result.rows[0]?.schema_pronto;
}

function createPoolFromConfig(config) {
  return new Pool({
    ...config,
    max: Number(process.env.DB_POOL_MAX) || 8,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
}

let pool = null;
let localPool = null;
let cloudPool = null;
let resolvedConfig = null;
let connectivityMonitor = null;
let onConnectivityChange = null;

function setConnectivityChangeHandler(handler) {
  onConnectivityChange = handler;
}

function notifyConnectivityChange() {
  if (typeof onConnectivityChange === 'function') {
    onConnectivityChange({
      hybrid: isHybridMode(),
      cloud: isCloudAvailable(),
      offline: isHybridMode() && !isCloudAvailable(),
    });
  }
}

function getPool() {
  if (isHybridMode()) {
    if (!localPool) {
      throw new Error(
        'Banco não inicializado. Aguarde initDatabase() ou configure DB_LOCAL_* no .env.'
      );
    }
    if (isCloudAvailable() && cloudPool) return cloudPool;
    return localPool;
  }

  if (!pool) {
    const config = resolvedConfig || buildPoolConfig();
    if (!config) {
      throw new Error(
        'Banco não inicializado. Aguarde initDatabase() ou configure DATABASE_POOLER_URL no .env.'
      );
    }
    pool = createPoolFromConfig(config);
  }
  return pool;
}

function getLocalPool() {
  if (isHybridMode()) {
    if (!localPool) {
      throw new Error('PostgreSQL local não inicializado.');
    }
    return localPool;
  }
  return getPool();
}

function getCloudPool() {
  return cloudPool;
}

async function ensureCloudPoolConfig() {
  if (resolvedConfig || buildPoolConfig()) return;
  if (!isCloudDatabase()) return;
  resolvedConfig = await discoverPoolerConfig();
  if (pool) {
    await pool.end();
    pool = null;
  }
}

async function ensureLocalDatabase(localConfig) {
  const cfg = localConfig || dbSync.buildLocalPoolConfig();
  const adminPool = new Pool({
    host: cfg.host || 'localhost',
    port: Number(cfg.port) || 5432,
    user: cfg.user || 'postgres',
    password: cfg.password != null ? cfg.password : 'root',
    database: 'postgres',
  });

  const databaseName = cfg.database || 'sys_cedro_wms';

  try {
    const exists = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName]
    );

    if (exists.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE ${databaseName}`);
    }
  } finally {
    await adminPool.end();
  }
}

async function runSchemaAndBootstrap(db) {
  if (await shouldRunSchema(db)) {
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await db.query(schema);
  }

  await dbSync.ensureSyncSchema(db);

  const { ensureMasterUser } = require('./auth');
  await ensureMasterUser();

  const { ensureFormaAReceber } = require('./formasPagamento');
  await ensureFormaAReceber();

  const { ensureVendedoresUsuariosExistentes } = require('./vendedorUsuario');
  await ensureVendedoresUsuariosExistentes();

  const { sincronizarVendedoresColaboradoresExistentes } = require('./colaboradorVendedor');
  await sincronizarVendedoresColaboradoresExistentes();
}

async function initHybridDatabase(options = {}) {
  const { skipStartupSync = false } = options;
  const localConfig = dbSync.buildLocalPoolConfig();
  await ensureLocalDatabase(localConfig);

  localPool = createPoolFromConfig(localConfig);
  pool = localPool;
  dbSync.setCloudAvailable(false);

  try {
    await localPool.query('SELECT 1');
  } catch (error) {
    throw new Error(
      `PostgreSQL local indisponível (${localConfig.host}:${localConfig.port}). `
      + 'Inicie o Postgres local ou ajuste DB_LOCAL_* no .env.\n'
      + error.message
    );
  }

  await runSchemaAndBootstrap(localPool);

  if (!skipStartupSync) {
    await connectCloudAndSync();
  }

  return getPool();
}

async function connectCloudAndSync() {
  if (!isHybridMode() || !localPool) return false;

  try {
    await ensureCloudPoolConfig();
    const cloudConfig = resolvedConfig || buildPoolConfig();
    if (!cloudConfig) {
      dbSync.setCloudAvailable(false);
      notifyConnectivityChange();
      return false;
    }

    if (cloudPool) {
      try {
        await cloudPool.query('SELECT 1');
      } catch (_) {
        try { await cloudPool.end(); } catch (e) { /* ignore */ }
        cloudPool = null;
      }
    }

    if (!cloudPool) {
      cloudPool = await dbSync.testPool(cloudConfig);
      if (cloudPool) {
        try {
          await dbSync.ensureSyncSchema(cloudPool);
        } catch (err) {
          console.warn('[database] Schema offline na nuvem:', err.message);
        }
      }
    }

    if (!cloudPool) {
      dbSync.setCloudAvailable(false);
      notifyConnectivityChange();
      return false;
    }

    const summary = await dbSync.runStartupSync(localPool, cloudPool);
    console.log('[database] Supabase conectado:', JSON.stringify(summary));
    notifyConnectivityChange();
    return true;
  } catch (error) {
    console.warn('[database] Falha ao conectar Supabase:', error.message);
    dbSync.setCloudAvailable(false);
    if (cloudPool) {
      try { await cloudPool.end(); } catch (e) { /* ignore */ }
      cloudPool = null;
    }
    notifyConnectivityChange();
    return false;
  }
}

async function probeCloudConnection() {
  if (!isHybridMode()) return isCloudAvailable();

  const cloudConfig = resolvedConfig || buildPoolConfig();
  if (!cloudConfig) return false;

  const test = await dbSync.testPool(cloudConfig);
  if (!test) return false;

  try {
    await test.query('SELECT 1');
    return true;
  } catch (_) {
    return false;
  } finally {
    try { await test.end(); } catch (e) { /* ignore */ }
  }
}

function startConnectivityMonitor(intervalMs = 15000) {
  if (!isHybridMode() || connectivityMonitor) return;

  connectivityMonitor = setInterval(async () => {
    const wasOnline = isCloudAvailable();

    if (wasOnline && cloudPool) {
      try {
        await cloudPool.query('SELECT 1');
        return;
      } catch (_) {
        console.warn('[database] Conexão com Supabase perdida.');
        dbSync.setCloudAvailable(false);
        try { await cloudPool.end(); } catch (e) { /* ignore */ }
        cloudPool = null;
        notifyConnectivityChange();
      }
      return;
    }

    const reachable = await probeCloudConnection();
    if (reachable && !wasOnline) {
      console.log('[database] Supabase disponível — reconectando...');
      await connectCloudAndSync();
    }
  }, intervalMs);
}

function stopConnectivityMonitor() {
  if (connectivityMonitor) {
    clearInterval(connectivityMonitor);
    connectivityMonitor = null;
  }
}

async function ensureCloudPoolConnected() {
  if (cloudPool && isCloudAvailable()) return cloudPool;
  await connectCloudAndSync();
  return cloudPool;
}

async function runHybridStartupSync() {
  return connectCloudAndSync();
}

async function initDatabase(options = {}) {
  if (isHybridMode()) {
    return initHybridDatabase(options);
  }

  if (!isCloudDatabase()) {
    await ensureLocalDatabase();
  } else {
    await ensureCloudPoolConfig();
  }

  const db = getPool();

  try {
    await db.query('SELECT 1');
  } catch (error) {
    const help = cloudConnectionHelp(error);
    if (help) {
      throw new Error(`${error.message}${help}`);
    }
    throw error;
  }

  await runSchemaAndBootstrap(db);

  return db;
}

module.exports = {
  getPool,
  getLocalPool,
  getCloudPool,
  initDatabase,
  connectCloudAndSync,
  runHybridStartupSync,
  startConnectivityMonitor,
  stopConnectivityMonitor,
  setConnectivityChangeHandler,
  isCloudDatabase,
  isHybridMode,
  isCloudAvailable,
  getSyncStatus,
  buildPoolConfig,
};
