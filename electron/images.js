const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const STORAGE_MAX = 1200;
const STORAGE_SIZE = 800;
const PDF_IMAGE_SIZE = 72;
const PLACEHOLDER_NAME = 'placeholder-produto.jpg';

let fotosDir = null;
let placeholderPath = null;

function getFotosDir() {
  if (!fotosDir) {
    try {
      const { app } = require('electron');
      if (app?.getPath) {
        fotosDir = path.join(app.getPath('userData'), 'produtos-fotos');
      }
    } catch (_) {
      // ambiente sem Electron (scripts de teste)
    }
    if (!fotosDir) {
      fotosDir = path.join(__dirname, '..', 'data', 'produtos-fotos');
    }
    fs.mkdirSync(fotosDir, { recursive: true });
  }
  return fotosDir;
}

async function ensurePlaceholder() {
  if (placeholderPath && fs.existsSync(placeholderPath)) return placeholderPath;

  const dir = getFotosDir();
  placeholderPath = path.join(dir, PLACEHOLDER_NAME);

  if (!fs.existsSync(placeholderPath)) {
    const svg = `
      <svg width="${STORAGE_SIZE}" height="${STORAGE_SIZE}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#e6e0d8"/>
        <rect x="120" y="100" width="160" height="120" rx="8" fill="#d4cdc4"/>
        <circle cx="170" cy="145" r="18" fill="#b8afa3"/>
        <path d="M130 210 L200 150 L270 210 Z" fill="#b8afa3"/>
        <text x="200" y="260" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#4a2e1f">Sem foto</text>
      </svg>
    `;
    await sharp(Buffer.from(svg))
      .resize(STORAGE_SIZE, STORAGE_SIZE)
      .jpeg({ quality: 90 })
      .toFile(placeholderPath);
  }

  return placeholderPath;
}

async function initImages() {
  await ensurePlaceholder();
}

function getProdutoFotoPath(fotoPath) {
  if (fotoPath) {
    const full = path.join(getFotosDir(), fotoPath);
    if (fs.existsSync(full)) return full;
  }
  return placeholderPath || path.join(getFotosDir(), PLACEHOLDER_NAME);
}

async function salvarFotoProduto(produtoId, base64Data) {
  const base64 = base64Data.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const filename = `produto-${produtoId}.jpg`;
  const filepath = path.join(getFotosDir(), filename);

  await sharp(buffer)
    .rotate()
    .resize(STORAGE_MAX, STORAGE_MAX, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .resize(STORAGE_SIZE, STORAGE_SIZE, {
      fit: 'cover',
      position: 'centre',
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(filepath);

  return filename;
}

async function removerFotoProduto(fotoPath) {
  if (!fotoPath || fotoPath === PLACEHOLDER_NAME) return;
  const full = path.join(getFotosDir(), fotoPath);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

async function getProdutoFotoDataUrl(fotoPath) {
  const imagePath = getProdutoFotoPath(fotoPath);
  await ensurePlaceholder();
  const buffer = fs.readFileSync(imagePath);
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function getPdfImagePath(fotoPath) {
  await ensurePlaceholder();
  const source = getProdutoFotoPath(fotoPath);
  const cacheName = `pdf-${path.basename(source, path.extname(source))}-hq.jpg`;
  const cachePath = path.join(getFotosDir(), cacheName);
  const sourceStat = fs.existsSync(source) ? fs.statSync(source) : null;
  const cacheStat = fs.existsSync(cachePath) ? fs.statSync(cachePath) : null;

  if (!cacheStat || !sourceStat || cacheStat.mtimeMs < sourceStat.mtimeMs) {
    await sharp(source)
      .resize(PDF_IMAGE_SIZE, PDF_IMAGE_SIZE, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 88 })
      .toFile(cachePath);
  }

  return cachePath;
}

module.exports = {
  initImages,
  salvarFotoProduto,
  removerFotoProduto,
  getProdutoFotoPath,
  getProdutoFotoDataUrl,
  getPdfImagePath,
  PDF_IMAGE_SIZE,
};
