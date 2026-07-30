process.env.SYS_CEDRO_WEB = '1';
process.env.DB_HYBRID = process.env.DB_HYBRID || 'false';

const {
  ensureReady,
  invokeChannel,
  resolveChannel,
  extractBearerToken,
} = require('../server/bootstrap');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    await ensureReady();
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const { method, channel, args = [] } = body;
    const resolved = resolveChannel(method, channel);
    const token = extractBearerToken({ headers: req.headers, body });
    const data = await invokeChannel(resolved, args, token);
    sendJson(res, 200, { success: true, data });
  } catch (err) {
    const status = /login|senha|Sessão|permissão|Faça login/i.test(err.message || '')
      ? 401
      : 400;
    sendJson(res, status, { success: false, error: err.message || 'Erro' });
  }
};
