const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isAnexoPermitido } = require('./pdfAnexosMerge');
const storage = require('./supabaseStorage');
const { getWritableSubdir, isWebRuntime } = require('./runtimePaths');

let anexosDir = null;

function getAnexosDir() {
  if (!anexosDir) {
    if (storage.isCloudStorage()) {
      anexosDir = storage.getCacheDir(storage.BUCKETS.VENDAS_PLANEJADOS_ANEXOS);
    } else {
      anexosDir = getWritableSubdir('vendas-planejados-anexos');
    }
  }
  return anexosDir;
}

function sanitizeFilename(name) {
  return String(name || 'arquivo')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 180);
}

function parseAnexoBase64({ nome_original, base64 }) {
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

  return { buffer, mimeType, ext };
}

async function salvarAnexoArquivo(vendaPlanejadoId, { nome_original, base64 }) {
  const { buffer, mimeType, ext } = parseAnexoBase64({ nome_original, base64 });
  const filename = `vp-${vendaPlanejadoId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

  if (storage.isCloudStorage()) {
    await storage.uploadObject(
      storage.BUCKETS.VENDAS_PLANEJADOS_ANEXOS,
      filename,
      buffer,
      mimeType
    );
  } else if (isWebRuntime()) {
    throw new Error(
      'Anexos na web exigem Storage na nuvem. '
      + 'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) na Vercel.'
    );
  } else {
    const filepath = path.join(getAnexosDir(), filename);
    fs.writeFileSync(filepath, buffer);
  }

  return {
    nome_original: sanitizeFilename(nome_original) || filename,
    caminho: filename,
    tamanho_bytes: buffer.length,
    mime_type: mimeType,
  };
}

async function getAnexoPath(caminho) {
  if (!caminho) return null;
  const filename = path.basename(caminho);

  if (storage.isCloudStorage()) {
    try {
      return await storage.ensureLocalCache(
        storage.BUCKETS.VENDAS_PLANEJADOS_ANEXOS,
        filename
      );
    } catch (_) {
      return null;
    }
  }

  const full = path.join(getAnexosDir(), filename);
  return fs.existsSync(full) ? full : null;
}

async function removerAnexoArquivo(caminho) {
  if (!caminho) return;
  const filename = path.basename(caminho);

  if (storage.isCloudStorage()) {
    await storage.deleteObject(storage.BUCKETS.VENDAS_PLANEJADOS_ANEXOS, filename);
    storage.removeLocalCache(storage.BUCKETS.VENDAS_PLANEJADOS_ANEXOS, filename);
    return;
  }

  const full = path.join(getAnexosDir(), filename);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

async function abrirAnexo(caminho) {
  const full = await getAnexoPath(caminho);
  if (!full) throw new Error('Arquivo anexo não encontrado.');

  if (process.env.SYS_CEDRO_WEB === '1' || process.env.VERCEL === '1' || isWebRuntime()) {
    const buffer = fs.readFileSync(full);
    return {
      opened: false,
      fileName: path.basename(full),
      mimeType: 'application/octet-stream',
      base64: buffer.toString('base64'),
    };
  }

  try {
    const { shell } = require('electron');
    return shell.openPath(full);
  } catch {
    throw new Error('Não foi possível abrir o anexo neste ambiente.');
  }
}

module.exports = {
  getAnexosDir,
  salvarAnexoArquivo,
  getAnexoPath,
  removerAnexoArquivo,
  abrirAnexo,
};
