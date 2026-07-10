#!/usr/bin/env node
/** Descobre pooler Supabase (IPv4) — host exato varia por projeto. */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const eq = t.indexOf('=');
  if (eq === -1) return;
  if (!process.env[t.slice(0, eq).trim()]) {
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
});

const { Pool } = require('pg');
const ref = 'gzveuamcqokfbgyvxbed';
const parsed = new URL(process.env.DATABASE_URL);
const password = decodeURIComponent(parsed.password);

const regions = [
  'sa-east-1', 'us-east-1', 'us-east-2', 'us-west-1', 'eu-west-1',
  'eu-central-1', 'ap-southeast-1', 'ap-northeast-1', 'ap-south-1', 'ca-central-1',
];

function poolerHosts(region) {
  const hosts = [];
  for (let i = 0; i <= 5; i += 1) {
    hosts.push(`aws-${i}-${region}.pooler.supabase.com`);
  }
  hosts.push(`aws-${region}.pooler.supabase.com`);
  return hosts;
}

async function tryConnect(name, config) {
  const pool = new Pool({
    ...config,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
  });
  try {
    await pool.query('SELECT 1');
    console.log(`\nOK: ${name}`);
    if (config.connectionString) {
      console.log(config.connectionString.replace(/:[^@]+@/, ':***@'));
    } else {
      console.log(`postgresql://postgres.${ref}:***@${config.host}:${config.port}/postgres`);
    }
    await pool.end();
    return config.connectionString || `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${config.host}:${config.port}/postgres`;
  } catch (err) {
    const msg = `${err.code || 'erro'} ${err.message}`;
    if (!msg.includes('ENOTFOUND') && !msg.includes('ETIMEDOUT') && !msg.includes('tenant')) {
      console.log(`? ${name}: ${msg}`);
    }
    try { await pool.end(); } catch (_) {}
    return null;
  }
}

(async () => {
  console.log('Procurando pooler Supavisor (IPv4)...');

  for (const region of regions) {
    for (const host of poolerHosts(region)) {
      for (const port of [5432, 6543]) {
        const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
        const found = await tryConnect(`${host}:${port}`, {
          connectionString: url,
        });
        if (found) {
          console.log('\nCole no .env como DATABASE_URL=');
          process.exit(0);
        }

        const foundCfg = await tryConnect(`${host}:${port} (cfg)`, {
          host,
          port,
          user: `postgres.${ref}`,
          password,
          database: 'postgres',
        });
        if (foundCfg) {
          console.log('\nCole no .env como DATABASE_URL=');
          process.exit(0);
        }
      }
    }
  }

  console.log('\nNenhum pooler encontrado.');
  console.log('No painel: Connect → Session pooler → copie a URI completa.');
  process.exit(1);
})();
