/**
 * Bootstrap da API web (local + Vercel).
 * Força modo nuvem (sem híbrido/offline Electron).
 */
process.env.SYS_CEDRO_WEB = '1';
if (!process.env.DB_HYBRID) process.env.DB_HYBRID = 'false';

const path = require('path');

// Garante load do .env via database.js
const {
  initDatabase,
  isHybridMode,
  isCloudAvailable,
} = require('../electron/database');
const { ensureMasterUser } = require('../electron/auth');
const { initImages } = require('../electron/images');
const { createHandlers } = require('../electron/createHandlers');
const auth = require('../electron/auth');
const METHOD_CHANNEL_MAP = require('./methodChannelMap.json');

let readyPromise = null;
let handlers = null;

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await initDatabase({ skipStartupSync: true });
      try {
        await initImages();
      } catch (err) {
        console.warn('[web] initImages:', err.message);
      }
      await ensureMasterUser();
      handlers = createHandlers({
        getMainWindow: () => null,
        openExternal: async (url) => ({ opened: false, url }),
      });
      console.log(
        `[web] API pronta — hybrid=${isHybridMode()} cloud=${isCloudAvailable()} handlers=${Object.keys(handlers).length}`
      );
    })();
  }
  await readyPromise;
  return handlers;
}

function resolveChannel(method, channel) {
  if (channel) return channel;
  if (method && METHOD_CHANNEL_MAP[method]) return METHOD_CHANNEL_MAP[method];
  throw new Error(`Método desconhecido: ${method || channel || '(vazio)'}`);
}

function extractBearerToken(req) {
  const headers = req.headers || {};
  const header = headers.authorization || headers.Authorization;
  if (header && String(header).startsWith('Bearer ')) {
    return String(header).slice(7).trim();
  }
  const alt = headers['x-session-token'] || headers['X-Session-Token'];
  if (alt) return String(alt).trim();
  if (req.body?.token) return String(req.body.token);
  return null;
}

async function invokeChannel(channel, args = [], token = null) {
  const map = await ensureReady();
  const handler = map[channel];
  if (!handler) {
    throw new Error(`Canal não encontrado: ${channel}`);
  }

  let session = null;
  if (token) {
    session = auth.verifySessionToken(token);
  }

  return auth.runWithSession(session, async () => {
    auth.assertChannelAccess(channel);

    // auth:restore pode receber token no 2º arg
    let callArgs = Array.isArray(args) ? args : [args];
    if (channel === 'auth:restore' && token && callArgs.length === 1) {
      callArgs = [callArgs[0], token];
    }

    const data = await handler(null, ...callArgs);

    // login/restore já devolvem token no web
    return data;
  });
}

module.exports = {
  ensureReady,
  invokeChannel,
  resolveChannel,
  extractBearerToken,
  METHOD_CHANNEL_MAP,
  projectRoot: path.join(__dirname, '..'),
};
