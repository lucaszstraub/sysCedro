#!/usr/bin/env node
/**
 * Configura variáveis de ambiente no projeto Vercel a partir do .env local.
 *
 * Pré-requisitos:
 *   npx vercel login
 *   npx vercel link   (na raiz do repo)
 *
 * Uso:
 *   node scripts/configure-vercel-env.mjs
 *   node scripts/configure-vercel-env.mjs --preview --development
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

const KEYS = [
  'DATABASE_POOLER_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'DB_SSL',
  'DB_CLOUD',
  'DB_HYBRID',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SESSION_SECRET',
];

const FORCED = {
  DB_SSL: 'true',
  DB_CLOUD: 'true',
  DB_HYBRID: 'false',
  SYS_CEDRO_WEB: '1',
};

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function ensureSessionSecret(env) {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 16) return env.SESSION_SECRET;
  const generated = crypto.randomBytes(32).toString('hex');
  const line = `\n# Gerado para Vercel/web\nSESSION_SECRET=${generated}\n`;
  fs.appendFileSync(ENV_PATH, line);
  console.log('SESSION_SECRET gerado e salvo no .env local (não vai para o git).');
  return generated;
}

function vercelEnvAdd(key, value, targets) {
  for (const target of targets) {
    const result = spawnSync(
      'npx',
      ['--yes', 'vercel@41', 'env', 'add', key, target, '--force'],
      {
        cwd: ROOT,
        input: value,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    if (result.status !== 0) {
      const err = (result.stderr || result.stdout || '').trim();
      throw new Error(`Falha ao definir ${key} (${target}): ${err || `exit ${result.status}`}`);
    }
    console.log(`✓ ${key} → ${target}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const targets = ['production'];
  if (args.includes('--preview')) targets.push('preview');
  if (args.includes('--development')) targets.push('development');
  if (!args.includes('--production-only') && !args.includes('--preview') && !args.includes('--development')) {
    targets.push('preview');
  }

  if (!fs.existsSync(path.join(ROOT, '.vercel', 'project.json'))) {
    console.error('Projeto Vercel não linkado. Rode antes:\n  npx vercel login\n  npx vercel link');
    process.exit(1);
  }

  try {
    execFileSync('npx', ['--yes', 'vercel@41', 'whoami'], { cwd: ROOT, stdio: 'pipe' });
  } catch {
    console.error('Não autenticado na Vercel. Rode:\n  npx vercel login');
    process.exit(1);
  }

  const env = loadEnvFile(ENV_PATH);
  env.SESSION_SECRET = ensureSessionSecret(env);
  Object.assign(env, FORCED);

  const missing = KEYS.filter((k) => k !== 'SESSION_SECRET' && !env[k]);
  if (missing.length) {
    console.error('Faltam variáveis no .env:', missing.join(', '));
    process.exit(1);
  }

  const toSet = [...KEYS, 'SYS_CEDRO_WEB'];
  console.log(`Configurando ${toSet.length} variáveis em: ${targets.join(', ')}`);

  for (const key of toSet) {
    vercelEnvAdd(key, String(env[key]), targets);
  }

  console.log('\nConcluído. Faça um novo deploy na Vercel para aplicar as variáveis.');
}

main();
