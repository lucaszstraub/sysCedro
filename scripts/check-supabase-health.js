#!/usr/bin/env node
/**
 * Verifica conexão e saúde básica do banco Supabase.
 * Uso: node scripts/check-supabase-health.js
 */

const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('FAIL: .env não encontrado');
    process.exit(1);
  }
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq === -1) return;
    const key = t.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = t.slice(eq + 1).trim();
  });
}

async function connectPool() {
  const { Pool } = require('pg');
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL não definida');

  const parsed = new URL(baseUrl);
  const password = encodeURIComponent(decodeURIComponent(parsed.password));
  const ref = 'gzveuamcqokfbgyvxbed';
  const candidates = [
    ['env', baseUrl],
    ['direct', `postgresql://postgres:${password}@db.${ref}.supabase.co:5432/postgres`],
    ['pooler-sa-east-1-session', `postgresql://postgres.${ref}:${password}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`],
    ['pooler-sa-east-1-transaction', `postgresql://postgres.${ref}:${password}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`],
    ['pooler-sa-east-1-postgres-user', `postgresql://postgres:${password}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`],
  ];

  let lastError = null;
  for (const [name, url] of candidates) {
    const pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
    });
    try {
      await pool.query('SELECT 1');
      if (name !== 'env') {
        console.log(`Conexão via fallback: ${name}`);
      }
      return pool;
    } catch (err) {
      console.log(`Tentativa ${name}: ${err.code || 'erro'} — ${err.message}`);
      lastError = err;
      try {
        await pool.end();
      } catch (_) {
        // ignore
      }
    }
  }
  throw lastError || new Error('Não foi possível conectar');
}

function getApiKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function restFetch(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const key = getApiKey();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });
  return res;
}

async function restCount(table) {
  const res = await restFetch(`/rest/v1/${table}?select=id`, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) return { ok: false, count: null, status: res.status };
  const range = res.headers.get('content-range') || '';
  const match = range.match(/\/(\d+)$/);
  return { ok: true, count: match ? Number(match[1]) : 0 };
}

async function runRestHealthChecks() {
  const checks = [];

  const ping = await restFetch('/rest/v1/categorias?select=id&limit=1');
  checks.push({
    name: 'REST API (projeto ativo)',
    ok: ping.ok,
    detail: ping.ok ? 'respondendo' : `HTTP ${ping.status}`,
  });

  for (const table of ['categorias', 'produtos', 'localizacoes', 'usuarios']) {
    const result = await restCount(table);
    checks.push({
      name: `Tabela ${table}`,
      ok: result.ok,
      detail: result.ok ? `${result.count} registros` : `HTTP ${result.status}`,
    });
  }

  const bucketsRes = await restFetch('/storage/v1/bucket');
  let bucketDetail = 'não verificado';
  let bucketsOk = false;
  if (bucketsRes.ok) {
    const buckets = await bucketsRes.json();
    const wanted = ['produtos-fotos', 'vendas-planejados-anexos'];
    const found = buckets.filter((b) => wanted.includes(b.id));
    bucketsOk = found.length === 2;
    bucketDetail = found.map((b) => `${b.id} (public=${b.public})`).join(', ') || 'nenhum';
  } else {
    bucketDetail = `HTTP ${bucketsRes.status}`;
  }
  checks.push({ name: 'Buckets Storage', ok: bucketsOk, detail: bucketDetail });

  return checks;
}

async function main() {
  loadEnv();

  let pool = null;
  try {
    pool = await connectPool();
  } catch (err) {
    console.log('\n=== Supabase — saúde do banco ===\n');
    console.log(`[FALHA] Conexão Postgres: ${err.message}`);
    console.log('[INFO] Verificando via REST API (service role)...\n');

    const checks = await runRestHealthChecks();
    let allOk = false;
    for (const check of checks) {
      const status = check.ok ? 'OK' : 'FALHA';
      if (check.ok) allOk = true;
      console.log(`[${status}] ${check.name}: ${check.detail}`);
    }

    const schemaOk = checks.filter((c) => c.name.startsWith('Tabela ')).every((c) => c.ok);
    const bucketsOk = checks.find((c) => c.name === 'Buckets Storage')?.ok;
    console.log(
      schemaOk && bucketsOk
        ? '\nResultado: BANCO SAUDÁVEL via API (ajuste DATABASE_URL para o app Electron)\n'
        : '\nResultado: API ok, mas revise schema/setup ou DATABASE_URL\n'
    );
    console.log('Dica: Project Settings → Database → Connection string → URI (Session pooler)\n');
    process.exit(schemaOk ? 0 : 1);
  }

  const checks = [];

  try {
    const ping = await pool.query('SELECT current_database() AS db, now() AS server_time, version() AS version');
    checks.push({ name: 'Conexão', ok: true, detail: ping.rows[0].db });

    const tables = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM pg_tables
      WHERE schemaname = 'public'
    `);
    const tableCount = tables.rows[0].total;
    checks.push({
      name: 'Tabelas (public)',
      ok: tableCount >= 40,
      detail: `${tableCount} tabelas`,
    });

    const core = await pool.query(`
      SELECT
        to_regclass('public.usuarios') IS NOT NULL AS usuarios,
        to_regclass('public.produtos') IS NOT NULL AS produtos,
        to_regclass('public.vendas') IS NOT NULL AS vendas,
        to_regclass('public.vendas_planejados') IS NOT NULL AS vendas_planejados
    `);
    const c = core.rows[0];
    const coreOk = c.usuarios && c.produtos && c.vendas && c.vendas_planejados;
    checks.push({
      name: 'Tabelas principais',
      ok: coreOk,
      detail: `usuarios=${c.usuarios}, produtos=${c.produtos}, vendas=${c.vendas}, vendas_planejados=${c.vendas_planejados}`,
    });

    const rls = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
      WHERE t.schemaname = 'public' AND c.relrowsecurity = true
    `);
    checks.push({
      name: 'RLS habilitado',
      ok: rls.rows[0].total > 0,
      detail: `${rls.rows[0].total} tabelas com RLS`,
    });

    const buckets = await pool.query(`
      SELECT id, public, file_size_limit
      FROM storage.buckets
      WHERE id IN ('produtos-fotos', 'vendas-planejados-anexos')
      ORDER BY id
    `);
    checks.push({
      name: 'Buckets Storage',
      ok: buckets.rows.length === 2,
      detail: buckets.rows.map((b) => `${b.id} (public=${b.public})`).join(', ') || 'nenhum',
    });

    const seeds = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM categorias) AS categorias,
        (SELECT COUNT(*)::int FROM produtos) AS produtos,
        (SELECT COUNT(*)::int FROM localizacoes) AS localizacoes,
        (SELECT COUNT(*)::int FROM usuarios) AS usuarios
    `);
    const s = seeds.rows[0];
    checks.push({
      name: 'Dados iniciais (schema)',
      ok: true,
      detail: `categorias=${s.categorias}, produtos=${s.produtos}, localizacoes=${s.localizacoes}, usuarios=${s.usuarios}`,
    });

    console.log('\n=== Supabase — saúde do banco ===\n');
    let allOk = true;
    for (const check of checks) {
      const status = check.ok ? 'OK' : 'FALHA';
      if (!check.ok) allOk = false;
      console.log(`[${status}] ${check.name}: ${check.detail}`);
    }
    console.log(allOk ? '\nResultado: SAUDÁVEL\n' : '\nResultado: PROBLEMAS ENCONTRADOS\n');
    process.exit(allOk ? 0 : 1);
  } catch (err) {
    console.error('\nFAIL:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
