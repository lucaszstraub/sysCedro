const fs = require('fs');
const path = require('path');
const { isCloudDatabase } = require('./database');

const BUCKETS = {
  PRODUTOS_FOTOS: 'produtos-fotos',
  VENDAS_PLANEJADOS_ANEXOS: 'vendas-planejados-anexos',
};

function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/$/, '');
}

function getServiceKey() {
  return process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || '';
}

function isCloudStorage() {
  return isCloudDatabase() && Boolean(getSupabaseUrl() && getServiceKey());
}

function encodeObjectPath(objectPath) {
  return String(objectPath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function apiHeaders(contentType) {
  const key = getServiceKey();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

function getCacheDir(bucket) {
  let base = null;
  try {
    const { app } = require('electron');
    if (app?.getPath) base = app.getPath('userData');
  } catch (_) {
    // ambiente sem Electron
  }
  if (!base) base = path.join(__dirname, '..', 'data');
  const dir = path.join(base, 'storage-cache', bucket);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function uploadObject(bucket, objectPath, buffer, contentType) {
  const base = getSupabaseUrl();
  const encoded = encodeObjectPath(objectPath);
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${encoded}`, {
    method: 'POST',
    headers: {
      ...apiHeaders(contentType),
      'x-upsert': 'true',
    },
    body: buffer,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Upload Storage falhou (${res.status}): ${detail || res.statusText}`);
  }
}

async function downloadObject(bucket, objectPath) {
  const base = getSupabaseUrl();
  const encoded = encodeObjectPath(objectPath);
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${encoded}`, {
    headers: apiHeaders(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Download Storage falhou (${res.status}): ${detail || res.statusText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function deleteObject(bucket, objectPath) {
  const base = getSupabaseUrl();
  const encoded = encodeObjectPath(objectPath);
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${encoded}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Delete Storage falhou (${res.status}): ${detail || res.statusText}`);
  }
}

async function ensureLocalCache(bucket, objectPath) {
  const safeName = path.basename(objectPath);
  const cachePath = path.join(getCacheDir(bucket), safeName);
  if (fs.existsSync(cachePath)) return cachePath;

  const buffer = await downloadObject(bucket, objectPath);
  fs.writeFileSync(cachePath, buffer);
  return cachePath;
}

function removeLocalCache(bucket, objectPath) {
  if (!objectPath) return;
  const cachePath = path.join(getCacheDir(bucket), path.basename(objectPath));
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
}

module.exports = {
  BUCKETS,
  isCloudStorage,
  uploadObject,
  downloadObject,
  deleteObject,
  ensureLocalCache,
  removeLocalCache,
  getCacheDir,
};
