const express = require('express');
const {
  ensureReady,
  invokeChannel,
  resolveChannel,
  extractBearerToken,
} = require('./bootstrap');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await ensureReady();
      res.json({ ok: true, runtime: 'web', vercel: process.env.VERCEL === '1' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /**
   * Endpoint único: { method | channel, args: [] }
   * Resposta no mesmo formato do Electron: { success, data|error }
   */
  app.post('/api/invoke', async (req, res) => {
    try {
      const { method, channel, args = [] } = req.body || {};
      const resolved = resolveChannel(method, channel);
      const token = extractBearerToken(req);
      const data = await invokeChannel(resolved, args, token);
      res.json({ success: true, data });
    } catch (err) {
      const status = /login|senha|Sessão|permissão|Faça login/i.test(err.message || '')
        ? 401
        : 400;
      res.status(status).json({ success: false, error: err.message || 'Erro' });
    }
  });

  return app;
}

module.exports = { createApp };
