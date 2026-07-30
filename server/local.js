#!/usr/bin/env node
/**
 * API local para desenvolvimento web (sem Electron).
 * Uso: npm run web:api
 */
process.env.SYS_CEDRO_WEB = '1';

const { createApp } = require('./app');
const { ensureReady } = require('./bootstrap');

const port = Number(process.env.PORT || process.env.API_PORT || 3001);

(async () => {
  await ensureReady();
  const app = createApp();
  app.listen(port, () => {
    console.log(`[web] API em http://localhost:${port}`);
    console.log(`[web] Health: http://localhost:${port}/api/health`);
  });
})().catch((err) => {
  console.error('[web] Falha ao iniciar API:', err);
  process.exit(1);
});
