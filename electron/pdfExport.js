const { dialog, shell } = require('electron');

const PDF_FILTER = [{ name: 'PDF', extensions: ['pdf'] }];

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

async function salvarEAbrirPdf(browserWindow, { title, defaultPath }, gerarFn) {
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
};
