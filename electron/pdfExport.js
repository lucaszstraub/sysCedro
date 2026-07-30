const { dialog, shell } = (() => {
  try {
    return require('electron');
  } catch {
    return { dialog: null, shell: null };
  }
})();
const fs = require('fs');
const os = require('os');
const path = require('path');

const PDF_FILTER = [{ name: 'PDF', extensions: ['pdf'] }];

function isWebRuntime() {
  return process.env.SYS_CEDRO_WEB === '1'
    || process.env.VERCEL === '1'
    || !dialog
    || typeof dialog.showSaveDialog !== 'function';
}

function pdfTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sanitizeFilePart(value, maxLen = 48) {
  if (value == null || value === '') return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
}

/** Nome único por geração: partes descritivas + data/hora (evita sobrescrever ao salvar). */
function pdfDefaultFileName(...parts) {
  const base = parts.map((p) => sanitizeFilePart(p)).filter(Boolean).join('-');
  return `${base || 'documento'}-${pdfTimestamp()}.pdf`;
}

async function salvarPdfWeb(defaultPath, gerarFn) {
  const fileName = defaultPath?.endsWith('.pdf') ? defaultPath : `${defaultPath || 'documento'}.pdf`;
  const tmp = path.join(os.tmpdir(), `syscedro-${Date.now()}-${path.basename(fileName)}`);
  try {
    await gerarFn(tmp);
    const buf = fs.readFileSync(tmp);
    return {
      cancelled: false,
      fileName,
      pdfBase64: buf.toString('base64'),
      mimeType: 'application/pdf',
    };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

async function salvarEAbrirPdf(browserWindow, { title, defaultPath }, gerarFn) {
  if (isWebRuntime() || !browserWindow) {
    return salvarPdfWeb(defaultPath, gerarFn);
  }

  const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
    title,
    defaultPath,
    filters: PDF_FILTER,
  });
  if (canceled || !filePath) return { cancelled: true };

  await gerarFn(filePath);

  const openError = await shell.openPath(filePath);
  if (openError) {
    throw new Error(`PDF salvo, mas não foi possível abrir o arquivo: ${openError}`);
  }

  return { cancelled: false, filePath };
}

module.exports = {
  salvarEAbrirPdf,
  pdfDefaultFileName,
  sanitizeFilePart,
  isWebRuntime,
};
