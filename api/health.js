process.env.SYS_CEDRO_WEB = '1';
process.env.DB_HYBRID = process.env.DB_HYBRID || 'false';

const { ensureReady } = require('../server/bootstrap');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  try {
    await ensureReady();
    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      runtime: 'web',
      vercel: process.env.VERCEL === '1',
    }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
};
