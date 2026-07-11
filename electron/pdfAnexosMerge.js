const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_PT = 0.5 * 28.3465;

const EXT_IMAGEM = new Set(['.jpg', '.jpeg', '.png']);
const MIME_IMAGEM = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const EXT_PDF = new Set(['.pdf']);
const MIME_PDF = new Set(['application/pdf']);

function isImagemAnexo(anexo, filePath) {
  const ext = path.extname(anexo.nome_original || filePath || '').toLowerCase();
  const mime = (anexo.mime_type || '').toLowerCase();
  return EXT_IMAGEM.has(ext) || MIME_IMAGEM.has(mime);
}

function isPdfAnexo(anexo, filePath) {
  const ext = path.extname(anexo.nome_original || filePath || '').toLowerCase();
  const mime = (anexo.mime_type || '').toLowerCase();
  return EXT_PDF.has(ext) || MIME_PDF.has(mime);
}

function isAnexoPermitido(anexo, filePath) {
  return isImagemAnexo(anexo, filePath) || isPdfAnexo(anexo, filePath);
}

async function criarPdfPaginaImagem(filePath) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  const bytes = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  const image = ext === '.png'
    ? await pdfDoc.embedPng(bytes)
    : await pdfDoc.embedJpg(bytes);

  const maxWidth = A4_WIDTH - (2 * MARGIN_PT);
  const maxHeight = A4_HEIGHT - (2 * MARGIN_PT);
  const imgW = image.width;
  const imgH = image.height;

  let width = maxWidth;
  let height = (imgH / imgW) * width;
  if (height > maxHeight) {
    height = maxHeight;
    width = (imgW / imgH) * height;
  }

  const x = (A4_WIDTH - width) / 2;
  const y = (A4_HEIGHT - height) / 2;

  page.drawImage(image, { x, y, width, height });
  return Buffer.from(await pdfDoc.save());
}

async function mergePdfBuffers(buffers) {
  if (!buffers.length) {
    throw new Error('Nenhum conteúdo PDF para mesclar.');
  }

  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    if (!buf || !buf.length) continue;
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}

async function anexosParaBuffers(anexos, getAnexoPath) {
  const buffers = [];
  for (const anexo of anexos || []) {
    const fullPath = await getAnexoPath(anexo.caminho);
    if (!fullPath || !fs.existsSync(fullPath)) continue;
    if (!isAnexoPermitido(anexo, fullPath)) continue;

    try {
      if (isImagemAnexo(anexo, fullPath)) {
        buffers.push(await criarPdfPaginaImagem(fullPath));
      } else if (isPdfAnexo(anexo, fullPath)) {
        buffers.push(fs.readFileSync(fullPath));
      }
    } catch (err) {
      console.warn(`Anexo ignorado no PDF (${anexo.nome_original}):`, err.message);
    }
  }
  return buffers;
}

module.exports = {
  EXT_IMAGEM,
  MIME_IMAGEM,
  isImagemAnexo,
  isPdfAnexo,
  isAnexoPermitido,
  criarPdfPaginaImagem,
  mergePdfBuffers,
  anexosParaBuffers,
};
