const fs = require('fs');
const os = require('os');
const path = require('path');

function isWebRuntime() {
  return process.env.SYS_CEDRO_WEB === '1'
    || process.env.VERCEL === '1'
    || Boolean(process.env.VERCEL_ENV);
}

/**
 * Raiz gravável para cache/arquivos temporários.
 * Na Vercel /var/task é read-only — use sempre os.tmpdir().
 */
function getWritableDataRoot() {
  if (isWebRuntime()) {
    const dir = path.join(os.tmpdir(), 'syscedro-data');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  try {
    const { app } = require('electron');
    if (app?.getPath) return app.getPath('userData');
  } catch (_) {
    // ambiente sem Electron
  }

  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getWritableSubdir(...parts) {
  const dir = path.join(getWritableDataRoot(), ...parts.filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  isWebRuntime,
  getWritableDataRoot,
  getWritableSubdir,
};
