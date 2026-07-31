process.env.SYS_CEDRO_WEB = '1';
process.env.DB_HYBRID = process.env.DB_HYBRID || 'false';
process.env.DB_CLOUD = process.env.DB_CLOUD || 'true';
process.env.DB_SSL = process.env.DB_SSL || 'true';

const { getDbEnvDiagnostics } = require('../electron/database');
const { ensureReady } = require('../server/bootstrap');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');

  const dbEnv = getDbEnvDiagnostics();

  // Sempre devolve diagnóstico de env (mesmo se o banco falhar).
  try {
    await ensureReady();
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      runtime: 'web',
      vercel: process.env.VERCEL === '1',
      dbEnv,
    }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: err.message,
      dbEnv,
    }));
  }
};
