const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'root',
  database: 'sys_cedro_wms',
};

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool(DB_CONFIG);
  }
  return pool;
}

async function initDatabase() {
  const adminPool = new Pool({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    database: 'postgres',
  });

  try {
    const exists = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB_CONFIG.database]
    );

    if (exists.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE ${DB_CONFIG.database}`);
    }
  } finally {
    await adminPool.end();
  }

  const db = getPool();
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.query(schema);

  const { ensureMasterUser } = require('./auth');
  await ensureMasterUser();

  const { ensureVendedoresUsuariosExistentes } = require('./vendedorUsuario');
  await ensureVendedoresUsuariosExistentes();

  const { sincronizarVendedoresColaboradoresExistentes } = require('./colaboradorVendedor');
  await sincronizarVendedoresColaboradoresExistentes();

  return db;
}

module.exports = { getPool, initDatabase, DB_CONFIG };
