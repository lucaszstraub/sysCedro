const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isAnexoPermitido } = require('./pdfAnexosMerge');

let anexosDir = null;

function getAnexosDir() {
  if (!anexosDir) {
    try {
      const { app } = require('electron');
      if (app?.getPath) {
        anexosDir = path.join(app.getPath('userData'), 'vendas-planejados-anexos');
      }
    } catch (_) {
      // ambiente sem Electron
    }
    if (!anexosDir) {
      anexosDir = path.join(__dirname, '..', 'data', 'vendas-planejados-anexos');
    }
    fs.mkdirSync(anexosDir, { recursive: true });
  }
  return anexosDir;
}

function sanitizeFilename(name) {
  return String(name || 'arquivo')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 180);
}

function salvarAnexoArquivo(vendaPlanejadoId, { nome_original, base64 }) {
  const raw = String(base64 || '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : 'application/octet-stream';
  const base64Data = match ? match[2] : raw.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const ext = path.extname(nome_original || '').toLowerCase();
  const anexoRef = { nome_original, mime_type: mimeType };
  if (!isAnexoPermitido(anexoRef, `file${ext}`)) {
    throw new Error('Anexo inválido. Envie apenas PDF ou imagens (JPG, JPEG, PNG).');
  }

  const filename = `vp-${vendaPlanejadoId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filepath = path.join(getAnexosDir(), filename);
  fs.writeFileSync(filepath, buffer);

  return {
    nome_original: sanitizeFilename(nome_original) || filename,
    caminho: filename,
    tamanho_bytes: buffer.length,
    mime_type: mimeType,
  };
}

function getAnexoPath(caminho) {
  if (!caminho) return null;
  const full = path.join(getAnexosDir(), path.basename(caminho));
  return fs.existsSync(full) ? full : null;
}

function removerAnexoArquivo(caminho) {
  const full = getAnexoPath(caminho);
  if (full && fs.existsSync(full)) {
    fs.unlinkSync(full);
  }
}

function abrirAnexo(caminho) {
  const full = getAnexoPath(caminho);
  if (!full) throw new Error('Arquivo anexo não encontrado.');
  const { shell } = require('electron');
  return shell.openPath(full);
}

module.exports = {
  getAnexosDir,
  salvarAnexoArquivo,
  getAnexoPath,
  removerAnexoArquivo,
  abrirAnexo,
};
