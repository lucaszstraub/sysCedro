const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const OFFLINE_ID_THRESHOLD = 1_000_000_000;

const REFERENCE_TABLES = [
  'categorias',
  'fornecedores',
  'localizacoes',
  'formas_pagamento',
  'vendedores',
  'parceiros',
  'clientes',
  'produtos',
  'produtos_planejados',
];

const ORCAMENTO_PLANEJADO_TABLES = [
  'orcamentos_planejados',
  'orcamento_planejado_ambientes',
  'orcamento_planejado_itens',
];

const ORCAMENTO_TABLES = [
  'orcamentos',
  'orcamento_ambientes',
  'orcamento_itens',
];

let cloudAvailable = false;
let lastSyncSummary = null;

function setCloudAvailable(value) {
  cloudAvailable = Boolean(value);
}

function isHybridMode() {
  const flag = String(process.env.DB_HYBRID || '').toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(flag)) return false;
  if (['1', 'true', 'yes', 'on'].includes(flag)) return true;
  return Boolean(
    process.env.DATABASE_POOLER_URL
    || process.env.DATABASE_URL?.includes('supabase')
    || process.env.DB_HOST?.includes('pooler.supabase')
  );
}

function isCloudAvailable() {
  return cloudAvailable;
}

function getLastSyncSummary() {
  return lastSyncSummary;
}

function buildLocalPoolConfig() {
  return {
    host: process.env.DB_LOCAL_HOST || 'localhost',
    port: Number(process.env.DB_LOCAL_PORT) || 5432,
    user: process.env.DB_LOCAL_USER || 'postgres',
    password: process.env.DB_LOCAL_PASSWORD != null
      ? process.env.DB_LOCAL_PASSWORD
      : 'root',
    database: process.env.DB_LOCAL_NAME || 'sys_cedro_wms',
  };
}

function buildCloudPoolConfig(fromDatabaseModule) {
  if (fromDatabaseModule?.buildPoolConfig) {
    const cfg = fromDatabaseModule.buildPoolConfig();
    if (cfg) return cfg;
  }
  const url = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
  if (!url) return null;
  return {
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  };
}

async function testPool(config) {
  if (!config) return false;
  const pool = new Pool({ ...config, connectionTimeoutMillis: 8000 });
  try {
    await pool.query('SELECT 1');
    return pool;
  } catch (_) {
    try { await pool.end(); } catch (e) { /* ignore */ }
    return null;
  }
}

async function ensureSyncSchema(pool) {
  const sqlPath = path.join(__dirname, '..', 'database', 'sync-offline.sql');
  if (!fs.existsSync(sqlPath)) return;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}

async function getTableColumns(pool, table) {
  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return result.rows.map((r) => r.column_name);
}

async function upsertRows(localPool, table, rows, conflictColumn = 'id') {
  if (!rows.length) return { inserted: 0, updated: 0 };

  const localCols = await getTableColumns(localPool, table);
  const cols = Object.keys(rows[0]).filter((c) => localCols.includes(c));
  if (!cols.includes(conflictColumn)) return { inserted: 0, updated: 0 };

  const colList = cols.map((c) => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols
    .filter((c) => c !== conflictColumn)
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  let count = 0;
  const client = await localPool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const values = cols.map((c) => row[c]);
      const sql = updates
        ? `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
           ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updates}`
        : `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
           ON CONFLICT (${conflictColumn}) DO NOTHING`;
      await client.query(sql, values);
      count += 1;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { upserted: count };
}

async function pullTable(cloudPool, localPool, table, options = {}) {
  const { conflictColumn = 'id', where = '', skipPendingLocal = true } = options;
  const cloudRows = await cloudPool.query(`SELECT * FROM ${table} ${where}`.trim());
  if (!cloudRows.rows.length) return 0;

  let rows = cloudRows.rows;
  if (skipPendingLocal && table === 'clientes') {
    rows = rows.map((r) => ({ ...r, pendente_sync: false }));
  } else if (skipPendingLocal) {
    rows = rows.map((r) => ({ ...r, pendente_sync: false }));
  }

  const result = await upsertRows(localPool, table, rows, conflictColumn);
  return result.upserted || 0;
}

async function pullOrcamentoTree(cloudPool, localPool) {
  const counts = {};
  counts.orcamentos = await pullTable(cloudPool, localPool, 'orcamentos', { conflictColumn: 'id' });
  counts.orcamento_ambientes = await pullTable(
    cloudPool,
    localPool,
    'orcamento_ambientes',
    { conflictColumn: 'id' }
  );
  counts.orcamento_itens = await pullTable(
    cloudPool,
    localPool,
    'orcamento_itens',
    { conflictColumn: 'id' }
  );
  return counts;
}

async function pullOrcamentoPlanejadoTree(cloudPool, localPool) {
  const counts = {};
  counts.orcamentos_planejados = await pullTable(cloudPool, localPool, 'orcamentos_planejados', { conflictColumn: 'id' });
  counts.orcamento_planejado_ambientes = await pullTable(
    cloudPool,
    localPool,
    'orcamento_planejado_ambientes',
    { conflictColumn: 'id' }
  );
  counts.orcamento_planejado_itens = await pullTable(
    cloudPool,
    localPool,
    'orcamento_planejado_itens',
    { conflictColumn: 'id' }
  );
  return counts;
}

async function gerarNumeroOrcamentoPlanejadoCloud(cloudClient) {
  const result = await cloudClient.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^ORC-PL-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM orcamentos_planejados
    WHERE numero LIKE 'ORC-PL-%'
  `);
  return `ORC-PL-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

async function remapClienteId(localClient, localId, cloudId) {
  if (localId === cloudId) {
    await localClient.query('UPDATE clientes SET pendente_sync = false WHERE id = $1', [localId]);
    return;
  }
  await localClient.query('UPDATE orcamentos SET cliente_id = $2 WHERE cliente_id = $1', [localId, cloudId]);
  await localClient.query(
    'UPDATE orcamentos_planejados SET cliente_id = $2 WHERE cliente_id = $1',
    [localId, cloudId]
  );
  await localClient.query(
    'UPDATE clientes SET id = $2, pendente_sync = false WHERE id = $1',
    [localId, cloudId]
  );
}

async function pushCliente(localClient, cloudClient, clienteId) {
  const row = (await localClient.query('SELECT * FROM clientes WHERE id = $1', [clienteId])).rows[0];
  if (!row) return null;

  const existsCloud = await cloudClient.query(
    'SELECT id FROM clientes WHERE sync_uuid = $1',
    [row.sync_uuid]
  );
  if (existsCloud.rows[0]) {
    const cloudId = existsCloud.rows[0].id;
    await remapClienteId(localClient, clienteId, cloudId);
    return cloudId;
  }

  const inserted = await cloudClient.query(`
    INSERT INTO clientes (
      nome, cpf_cnpj, telefone, email, endereco, cidade, estado, cep, observacoes,
      ativo, sync_uuid, pendente_sync, criado_em
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12)
    ON CONFLICT (sync_uuid) DO UPDATE SET
      nome = EXCLUDED.nome,
      cpf_cnpj = EXCLUDED.cpf_cnpj,
      telefone = EXCLUDED.telefone,
      email = EXCLUDED.email,
      endereco = EXCLUDED.endereco,
      cidade = EXCLUDED.cidade,
      estado = EXCLUDED.estado,
      cep = EXCLUDED.cep,
      observacoes = EXCLUDED.observacoes,
      ativo = EXCLUDED.ativo,
      pendente_sync = false
    RETURNING id
  `, [
    row.nome, row.cpf_cnpj, row.telefone, row.email, row.endereco, row.cidade, row.estado,
    row.cep, row.observacoes, row.ativo !== false, row.sync_uuid, row.criado_em,
  ]);
  const cloudId = inserted.rows[0].id;
  await remapClienteId(localClient, clienteId, cloudId);
  return cloudId;
}

async function pushPendingClientes(localPool, cloudPool) {
  const pending = await localPool.query(`
    SELECT id FROM clientes
    WHERE pendente_sync = true OR id >= ${OFFLINE_ID_THRESHOLD}
    ORDER BY criado_em, id
  `);
  let pushed = 0;
  const localClient = await localPool.connect();
  const cloudClient = await cloudPool.connect();
  try {
    for (const row of pending.rows) {
      await localClient.query('BEGIN');
      await cloudClient.query('BEGIN');
      try {
        await pushCliente(localClient, cloudClient, row.id);
        await cloudClient.query('COMMIT');
        await localClient.query('COMMIT');
        pushed += 1;
      } catch (err) {
        await cloudClient.query('ROLLBACK');
        await localClient.query('ROLLBACK');
        console.error(`[sync] Falha ao enviar cliente ${row.id}:`, err.message);
      }
    }
  } finally {
    localClient.release();
    cloudClient.release();
  }
  return pushed;
}

async function remapOrcamentoPlanejadoIds(localClient, localOrcId, cloudOrcId, ambienteMap, itemMap) {
  for (const [localAmbId, cloudAmbId] of ambienteMap.entries()) {
    if (localAmbId === cloudAmbId) continue;
    await localClient.query(
      'UPDATE orcamento_planejado_itens SET ambiente_id = $2 WHERE ambiente_id = $1',
      [localAmbId, cloudAmbId]
    );
    await localClient.query(
      'UPDATE orcamento_planejado_ambientes SET id = $2 WHERE id = $1',
      [localAmbId, cloudAmbId]
    );
  }
  for (const [localItemId, cloudItemId] of itemMap.entries()) {
    if (localItemId === cloudItemId) continue;
    await localClient.query(
      'UPDATE orcamento_planejado_itens SET id = $2 WHERE id = $1',
      [localItemId, cloudItemId]
    );
  }
  await localClient.query(
    'UPDATE orcamento_planejado_itens SET orcamento_planejado_id = $2, pendente_sync = false WHERE orcamento_planejado_id = $1',
    [localOrcId, cloudOrcId]
  );
  await localClient.query(
    'UPDATE orcamento_planejado_ambientes SET orcamento_planejado_id = $2, pendente_sync = false WHERE orcamento_planejado_id = $1',
    [localOrcId, cloudOrcId]
  );
  if (localOrcId !== cloudOrcId) {
    await localClient.query(
      'UPDATE orcamentos_planejados SET id = $2, pendente_sync = false WHERE id = $1',
      [localOrcId, cloudOrcId]
    );
  } else {
    await localClient.query(
      'UPDATE orcamentos_planejados SET pendente_sync = false WHERE id = $1',
      [localOrcId]
    );
  }
}

async function pushOrcamentoPlanejado(localClient, cloudClient, orcamentoId) {
  const row = (await localClient.query('SELECT * FROM orcamentos_planejados WHERE id = $1', [orcamentoId])).rows[0];
  if (!row) return null;

  const existsCloud = await cloudClient.query(
    'SELECT id FROM orcamentos_planejados WHERE sync_uuid = $1',
    [row.sync_uuid]
  );
  if (existsCloud.rows[0]) {
    const cloudId = existsCloud.rows[0].id;
    if (cloudId !== orcamentoId) {
      await localClient.query(
        'UPDATE orcamento_planejado_itens SET orcamento_planejado_id = $2 WHERE orcamento_planejado_id = $1',
        [orcamentoId, cloudId]
      );
      await localClient.query(
        'UPDATE orcamento_planejado_ambientes SET orcamento_planejado_id = $2 WHERE orcamento_planejado_id = $1',
        [orcamentoId, cloudId]
      );
      await localClient.query(
        'UPDATE orcamentos_planejados SET id = $2, pendente_sync = false WHERE id = $1',
        [orcamentoId, cloudId]
      );
    } else {
      await localClient.query(
        'UPDATE orcamentos_planejados SET pendente_sync = false WHERE id = $1',
        [orcamentoId]
      );
    }
    return cloudId;
  }

  let numero = row.numero;
  const numeroConflito = await cloudClient.query(
    'SELECT 1 FROM orcamentos_planejados WHERE numero = $1 AND sync_uuid <> $2 LIMIT 1',
    [numero, row.sync_uuid]
  );
  if (numeroConflito.rowCount > 0) {
    numero = await gerarNumeroOrcamentoPlanejadoCloud(cloudClient);
    await localClient.query(
      'UPDATE orcamentos_planejados SET numero = $2 WHERE id = $1',
      [orcamentoId, numero]
    );
  }

  const inserted = await cloudClient.query(`
    INSERT INTO orcamentos_planejados (
      numero, cliente_id, vendedor_id, status, validade, validade_dias,
      prazo_entrega_dias, prazo_entrega_outro, observacoes,
      subtotal, desconto, formas_pagamento, total, motivo_encerramento, encerrado_em,
      sync_uuid, pendente_sync, criado_em, atualizado_em
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false,$17,$18)
    ON CONFLICT (sync_uuid) DO UPDATE SET
      status = EXCLUDED.status,
      validade = EXCLUDED.validade,
      prazo_entrega_dias = EXCLUDED.prazo_entrega_dias,
      prazo_entrega_outro = EXCLUDED.prazo_entrega_outro,
      observacoes = EXCLUDED.observacoes,
      subtotal = EXCLUDED.subtotal,
      desconto = EXCLUDED.desconto,
      formas_pagamento = EXCLUDED.formas_pagamento,
      total = EXCLUDED.total,
      motivo_encerramento = EXCLUDED.motivo_encerramento,
      encerrado_em = EXCLUDED.encerrado_em,
      atualizado_em = EXCLUDED.atualizado_em,
      pendente_sync = false
    RETURNING id
  `, [
    numero, row.cliente_id, row.vendedor_id, row.status, row.validade, row.validade_dias,
    row.prazo_entrega_dias, row.prazo_entrega_outro, row.observacoes,
    row.subtotal, row.desconto, row.formas_pagamento, row.total,
    row.motivo_encerramento || null, row.encerrado_em || null,
    row.sync_uuid, row.criado_em, row.atualizado_em,
  ]);
  const cloudOrcId = inserted.rows[0].id;

  const ambientes = await localClient.query(
    'SELECT * FROM orcamento_planejado_ambientes WHERE orcamento_planejado_id = $1 ORDER BY ordem, id',
    [orcamentoId]
  );
  const ambienteMap = new Map();
  for (const amb of ambientes.rows) {
    const insAmb = await cloudClient.query(`
      INSERT INTO orcamento_planejado_ambientes (orcamento_planejado_id, nome, ordem, sync_uuid, pendente_sync)
      VALUES ($1, $2, $3, $4, false)
      ON CONFLICT (sync_uuid) DO UPDATE SET
        nome = EXCLUDED.nome,
        ordem = EXCLUDED.ordem,
        orcamento_planejado_id = EXCLUDED.orcamento_planejado_id,
        pendente_sync = false
      RETURNING id
    `, [cloudOrcId, amb.nome, amb.ordem, amb.sync_uuid]);
    ambienteMap.set(amb.id, insAmb.rows[0].id);
  }

  const itens = await localClient.query(
    'SELECT * FROM orcamento_planejado_itens WHERE orcamento_planejado_id = $1 ORDER BY ordem, id',
    [orcamentoId]
  );
  const itemMap = new Map();
  for (const item of itens.rows) {
    const cloudAmbId = ambienteMap.get(item.ambiente_id) || item.ambiente_id;
    const insItem = await cloudClient.query(`
      INSERT INTO orcamento_planejado_itens (
        orcamento_planejado_id, ambiente_id, produto_planejado_id, descricao,
        largura, profundidade, altura, espessura_mdf, padrao_mdf,
        tipo_fundo, tipo_fundo_outro, tipo_porta, tipo_porta_outro,
        tipo_puxador, tipo_puxador_outro, cor_puxador,
        tipo_corredicas, tipo_corredicas_outro, canaleta_led, itens_extra,
        quantidade, preco_unitario, subtotal, ordem, sync_uuid, pendente_sync
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,false)
      ON CONFLICT (sync_uuid) DO UPDATE SET
        orcamento_planejado_id = EXCLUDED.orcamento_planejado_id,
        ambiente_id = EXCLUDED.ambiente_id,
        produto_planejado_id = EXCLUDED.produto_planejado_id,
        descricao = EXCLUDED.descricao,
        largura = EXCLUDED.largura,
        profundidade = EXCLUDED.profundidade,
        altura = EXCLUDED.altura,
        espessura_mdf = EXCLUDED.espessura_mdf,
        padrao_mdf = EXCLUDED.padrao_mdf,
        tipo_fundo = EXCLUDED.tipo_fundo,
        tipo_fundo_outro = EXCLUDED.tipo_fundo_outro,
        tipo_porta = EXCLUDED.tipo_porta,
        tipo_porta_outro = EXCLUDED.tipo_porta_outro,
        tipo_puxador = EXCLUDED.tipo_puxador,
        tipo_puxador_outro = EXCLUDED.tipo_puxador_outro,
        cor_puxador = EXCLUDED.cor_puxador,
        tipo_corredicas = EXCLUDED.tipo_corredicas,
        tipo_corredicas_outro = EXCLUDED.tipo_corredicas_outro,
        canaleta_led = EXCLUDED.canaleta_led,
        itens_extra = EXCLUDED.itens_extra,
        quantidade = EXCLUDED.quantidade,
        preco_unitario = EXCLUDED.preco_unitario,
        subtotal = EXCLUDED.subtotal,
        ordem = EXCLUDED.ordem,
        pendente_sync = false
      RETURNING id
    `, [
      cloudOrcId, cloudAmbId, item.produto_planejado_id, item.descricao,
      item.largura, item.profundidade, item.altura, item.espessura_mdf, item.padrao_mdf,
      item.tipo_fundo, item.tipo_fundo_outro, item.tipo_porta, item.tipo_porta_outro,
      item.tipo_puxador, item.tipo_puxador_outro, item.cor_puxador,
      item.tipo_corredicas, item.tipo_corredicas_outro, item.canaleta_led, item.itens_extra,
      item.quantidade, item.preco_unitario, item.subtotal, item.ordem, item.sync_uuid,
    ]);
    itemMap.set(item.id, insItem.rows[0].id);
  }

  if (orcamentoId !== cloudOrcId) {
    await remapOrcamentoPlanejadoIds(localClient, orcamentoId, cloudOrcId, ambienteMap, itemMap);
  } else {
    await localClient.query(
      'UPDATE orcamentos_planejados SET pendente_sync = false WHERE id = $1',
      [orcamentoId]
    );
  }

  return cloudOrcId;
}

async function pushPendingOrcamentosPlanejados(localPool, cloudPool) {
  const pending = await localPool.query(`
    SELECT id FROM orcamentos_planejados
    WHERE pendente_sync = true OR id >= ${OFFLINE_ID_THRESHOLD}
    ORDER BY criado_em, id
  `);
  let pushed = 0;
  const localClient = await localPool.connect();
  const cloudClient = await cloudPool.connect();
  try {
    for (const row of pending.rows) {
      await localClient.query('BEGIN');
      await cloudClient.query('BEGIN');
      try {
        await pushOrcamentoPlanejado(localClient, cloudClient, row.id);
        await cloudClient.query('COMMIT');
        await localClient.query('COMMIT');
        pushed += 1;
      } catch (err) {
        await cloudClient.query('ROLLBACK');
        await localClient.query('ROLLBACK');
        console.error(`[sync] Falha ao enviar orçamento planejado ${row.id}:`, err.message);
      }
    }
  } finally {
    localClient.release();
    cloudClient.release();
  }
  return pushed;
}

async function resetSequence(localPool, table, column = 'id') {
  await localPool.query(`
    SELECT setval(
      pg_get_serial_sequence('public.${table}', '${column}'),
      GREATEST(
        COALESCE((SELECT MAX(${column}) FROM ${table} WHERE ${column} < ${OFFLINE_ID_THRESHOLD}), 0),
        1
      )
    )
  `);
}

async function resetSequences(localPool) {
  const tables = [...new Set([
    ...REFERENCE_TABLES,
    ...ORCAMENTO_TABLES,
    ...ORCAMENTO_PLANEJADO_TABLES,
  ])];
  for (const table of tables) {
    try {
      await resetSequence(localPool, table);
    } catch (_) {
      // tabela sem serial
    }
  }
}

async function allocateOfflineId(client) {
  const result = await client.query("SELECT nextval('offline_entity_seq')::int AS id");
  return result.rows[0].id;
}

async function gerarNumeroOrcamentoCloud(cloudClient) {
  const result = await cloudClient.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^ORC-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM orcamentos
    WHERE numero LIKE 'ORC-%'
  `);
  return `ORC-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

async function remapOrcamentoIds(localClient, localOrcId, cloudOrcId, ambienteMap, itemMap) {
  for (const [localAmbId, cloudAmbId] of ambienteMap.entries()) {
    if (localAmbId === cloudAmbId) continue;
    await localClient.query(
      'UPDATE orcamento_itens SET ambiente_id = $2 WHERE ambiente_id = $1',
      [localAmbId, cloudAmbId]
    );
    await localClient.query(
      'UPDATE orcamento_ambientes SET id = $2 WHERE id = $1',
      [localAmbId, cloudAmbId]
    );
  }

  for (const [localItemId, cloudItemId] of itemMap.entries()) {
    if (localItemId === cloudItemId.id) continue;
    await localClient.query(
      'UPDATE orcamento_itens SET id = $2 WHERE id = $1',
      [localItemId, cloudItemId.id]
    );
  }

  await localClient.query(
    'UPDATE orcamento_itens SET orcamento_id = $2, pendente_sync = false WHERE orcamento_id = $1',
    [localOrcId, cloudOrcId]
  );
  await localClient.query(
    'UPDATE orcamento_ambientes SET orcamento_id = $2, pendente_sync = false WHERE orcamento_id = $1',
    [localOrcId, cloudOrcId]
  );

  if (localOrcId !== cloudOrcId) {
    await localClient.query(
      'UPDATE orcamentos SET id = $2, pendente_sync = false WHERE id = $1',
      [localOrcId, cloudOrcId]
    );
  } else {
    await localClient.query(
      'UPDATE orcamentos SET pendente_sync = false WHERE id = $1',
      [localOrcId]
    );
  }

  await localClient.query(`
    INSERT INTO sync_id_map (tabela, local_id, cloud_id, sync_uuid)
    SELECT 'orcamentos', $1, $2, sync_uuid FROM orcamentos WHERE id = $2
    ON CONFLICT (tabela, local_id) DO UPDATE SET cloud_id = EXCLUDED.cloud_id
  `, [localOrcId, cloudOrcId]);
}

async function pushOrcamento(localClient, cloudClient, orcamentoId) {
  const orc = await localClient.query('SELECT * FROM orcamentos WHERE id = $1', [orcamentoId]);
  if (!orc.rows[0]) return null;
  const row = orc.rows[0];

  const existsCloud = await cloudClient.query(
    'SELECT id FROM orcamentos WHERE sync_uuid = $1',
    [row.sync_uuid]
  );
  if (existsCloud.rows[0]) {
    const cloudId = existsCloud.rows[0].id;
    if (cloudId !== orcamentoId) {
      await localClient.query(
        'UPDATE orcamento_itens SET orcamento_id = $2 WHERE orcamento_id = $1',
        [orcamentoId, cloudId]
      );
      await localClient.query(
        'UPDATE orcamento_ambientes SET orcamento_id = $2 WHERE orcamento_id = $1',
        [orcamentoId, cloudId]
      );
      await localClient.query(
        'UPDATE orcamentos SET id = $2, pendente_sync = false WHERE id = $1',
        [orcamentoId, cloudId]
      );
    } else {
      await localClient.query(
        'UPDATE orcamentos SET pendente_sync = false WHERE id = $1',
        [orcamentoId]
      );
    }
    return cloudId;
  }

  let numero = row.numero;
  const numeroConflito = await cloudClient.query(
    'SELECT 1 FROM orcamentos WHERE numero = $1 AND sync_uuid <> $2 LIMIT 1',
    [numero, row.sync_uuid]
  );
  if (numeroConflito.rowCount > 0) {
    numero = await gerarNumeroOrcamentoCloud(cloudClient);
    await localClient.query('UPDATE orcamentos SET numero = $2 WHERE id = $1', [orcamentoId, numero]);
  }

  const inserted = await cloudClient.query(`
    INSERT INTO orcamentos (
      numero, cliente_id, vendedor_id, status, validade, validade_dias, observacoes,
      subtotal, desconto, formas_pagamento, total, motivo_encerramento, encerrado_em,
      sync_uuid, pendente_sync, criado_em, atualizado_em
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,$15,$16)
    ON CONFLICT (sync_uuid) DO UPDATE SET
      status = EXCLUDED.status,
      validade = EXCLUDED.validade,
      observacoes = EXCLUDED.observacoes,
      subtotal = EXCLUDED.subtotal,
      desconto = EXCLUDED.desconto,
      formas_pagamento = EXCLUDED.formas_pagamento,
      total = EXCLUDED.total,
      motivo_encerramento = EXCLUDED.motivo_encerramento,
      encerrado_em = EXCLUDED.encerrado_em,
      atualizado_em = EXCLUDED.atualizado_em,
      pendente_sync = false
    RETURNING id
  `, [
    numero, row.cliente_id, row.vendedor_id, row.status, row.validade, row.validade_dias,
    row.observacoes, row.subtotal, row.desconto, row.formas_pagamento, row.total,
    row.motivo_encerramento || null, row.encerrado_em || null,
    row.sync_uuid, row.criado_em, row.atualizado_em,
  ]);
  const cloudOrcId = inserted.rows[0].id;

  const ambientes = await localClient.query(
    'SELECT * FROM orcamento_ambientes WHERE orcamento_id = $1 ORDER BY ordem, id',
    [orcamentoId]
  );

  const ambienteMap = new Map();
  for (const amb of ambientes.rows) {
    const insAmb = await cloudClient.query(`
      INSERT INTO orcamento_ambientes (orcamento_id, nome, ordem, sync_uuid, pendente_sync)
      VALUES ($1, $2, $3, $4, false)
      ON CONFLICT (sync_uuid) DO UPDATE SET
        nome = EXCLUDED.nome,
        ordem = EXCLUDED.ordem,
        orcamento_id = EXCLUDED.orcamento_id,
        pendente_sync = false
      RETURNING id
    `, [cloudOrcId, amb.nome, amb.ordem, amb.sync_uuid]);
    ambienteMap.set(amb.id, insAmb.rows[0].id);
  }

  const itens = await localClient.query(
    'SELECT * FROM orcamento_itens WHERE orcamento_id = $1 ORDER BY ordem, id',
    [orcamentoId]
  );

  const itemMap = new Map();
  for (const item of itens.rows) {
    const cloudAmbId = ambienteMap.get(item.ambiente_id) || item.ambiente_id;
    const insItem = await cloudClient.query(`
      INSERT INTO orcamento_itens (
        orcamento_id, ambiente_id, produto_id, descricao, quantidade,
        preco_unitario, subtotal, ordem, sync_uuid, pendente_sync
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false)
      ON CONFLICT (sync_uuid) DO UPDATE SET
        orcamento_id = EXCLUDED.orcamento_id,
        ambiente_id = EXCLUDED.ambiente_id,
        produto_id = EXCLUDED.produto_id,
        descricao = EXCLUDED.descricao,
        quantidade = EXCLUDED.quantidade,
        preco_unitario = EXCLUDED.preco_unitario,
        subtotal = EXCLUDED.subtotal,
        ordem = EXCLUDED.ordem,
        pendente_sync = false
      RETURNING id
    `, [
      cloudOrcId, cloudAmbId, item.produto_id, item.descricao, item.quantidade,
      item.preco_unitario, item.subtotal, item.ordem,
      item.sync_uuid,
    ]);
    itemMap.set(item.id, { id: insItem.rows[0].id, ambiente_id: cloudAmbId });
  }

  if (orcamentoId !== cloudOrcId) {
    await remapOrcamentoIds(localClient, orcamentoId, cloudOrcId, ambienteMap, itemMap);
  } else {
    await localClient.query('UPDATE orcamentos SET pendente_sync = false WHERE id = $1', [orcamentoId]);
    await localClient.query(
      'UPDATE orcamento_ambientes SET pendente_sync = false WHERE orcamento_id = $1',
      [cloudOrcId]
    );
    await localClient.query(
      'UPDATE orcamento_itens SET pendente_sync = false WHERE orcamento_id = $1',
      [cloudOrcId]
    );
  }

  return cloudOrcId;
}

async function pushPendingOrcamentos(localPool, cloudPool) {
  const pending = await localPool.query(`
    SELECT id FROM orcamentos
    WHERE pendente_sync = true OR id >= ${OFFLINE_ID_THRESHOLD}
    ORDER BY criado_em, id
  `);

  let pushed = 0;
  const localClient = await localPool.connect();
  const cloudClient = await cloudPool.connect();
  try {
    for (const row of pending.rows) {
      await localClient.query('BEGIN');
      await cloudClient.query('BEGIN');
      try {
        await pushOrcamento(localClient, cloudClient, row.id);
        await cloudClient.query('COMMIT');
        await localClient.query('COMMIT');
        pushed += 1;
      } catch (err) {
        await cloudClient.query('ROLLBACK');
        await localClient.query('ROLLBACK');
        console.error(`[sync] Falha ao enviar orçamento ${row.id}:`, err.message);
      }
    }
  } finally {
    localClient.release();
    cloudClient.release();
  }
  return pushed;
}

async function runStartupSync(localPool, cloudPool) {
  const summary = {
    mode: 'hybrid',
    cloud: false,
    pulled: {},
    pushed_orcamentos: 0,
    pushed_orcamentos_planejados: 0,
    pushed_clientes: 0,
    started_at: new Date().toISOString(),
  };

  await ensureSyncSchema(localPool);
  if (cloudPool) {
    try {
      await ensureSyncSchema(cloudPool);
    } catch (err) {
      console.warn('[sync] Schema offline na nuvem:', err.message);
    }
  }

  if (!cloudPool) {
    cloudAvailable = false;
    summary.cloud = false;
    lastSyncSummary = summary;
    return summary;
  }

  try {
    await cloudPool.query('SELECT 1');
    cloudAvailable = true;
    summary.cloud = true;
    summary.pushed_clientes = await pushPendingClientes(localPool, cloudPool);
    summary.pushed_orcamentos = await pushPendingOrcamentos(localPool, cloudPool);
    summary.pushed_orcamentos_planejados = await pushPendingOrcamentosPlanejados(localPool, cloudPool);

    const uniqueRefTables = [...new Set(REFERENCE_TABLES)];
    for (const table of uniqueRefTables) {
      try {
        summary.pulled[table] = await pullTable(cloudPool, localPool, table, {
          conflictColumn: 'id',
        });
      } catch (err) {
        console.warn(`[sync] Pull ${table}:`, err.message);
        summary.pulled[table] = `erro: ${err.message}`;
      }
    }

    const orcCounts = await pullOrcamentoTree(cloudPool, localPool);
    const orcPlCounts = await pullOrcamentoPlanejadoTree(cloudPool, localPool);
    summary.pulled = { ...summary.pulled, ...orcCounts, ...orcPlCounts };

    await resetSequences(localPool);

    await localPool.query(`
      INSERT INTO sync_controle (chave, valor, atualizado_em)
      VALUES ('ultima_sincronizacao', $1, NOW())
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()
    `, [new Date().toISOString()]);
  } catch (err) {
    cloudAvailable = false;
    summary.cloud = false;
    summary.error = err.message;
    console.error('[sync] Erro na sincronização:', err.message);
  }

  lastSyncSummary = summary;
  return summary;
}

async function tryPushCliente(clienteId, localPool, cloudPool) {
  if (!cloudPool || !cloudAvailable) return null;
  const localClient = await localPool.connect();
  const cloudClient = await cloudPool.connect();
  try {
    await localClient.query('BEGIN');
    await cloudClient.query('BEGIN');
    const cloudId = await pushCliente(localClient, cloudClient, clienteId);
    await cloudClient.query('COMMIT');
    await localClient.query('COMMIT');
    return cloudId;
  } catch (err) {
    await cloudClient.query('ROLLBACK');
    await localClient.query('ROLLBACK');
    await localPool.query('UPDATE clientes SET pendente_sync = true WHERE id = $1', [clienteId]);
    return null;
  } finally {
    localClient.release();
    cloudClient.release();
  }
}

async function tryPushOrcamentoPlanejado(orcamentoId, localPool, cloudPool) {
  if (!cloudPool || !cloudAvailable) return null;
  const localClient = await localPool.connect();
  const cloudClient = await cloudPool.connect();
  try {
    await localClient.query('BEGIN');
    await cloudClient.query('BEGIN');
    const cloudId = await pushOrcamentoPlanejado(localClient, cloudClient, orcamentoId);
    await cloudClient.query('COMMIT');
    await localClient.query('COMMIT');
    return cloudId;
  } catch (err) {
    await cloudClient.query('ROLLBACK');
    await localClient.query('ROLLBACK');
    await localPool.query(
      'UPDATE orcamentos_planejados SET pendente_sync = true WHERE id = $1',
      [orcamentoId]
    );
    return null;
  } finally {
    localClient.release();
    cloudClient.release();
  }
}

async function tryPushOrcamento(orcamentoId, localPool, cloudPool) {
  if (!cloudPool || !cloudAvailable) return null;
  const localClient = await localPool.connect();
  const cloudClient = await cloudPool.connect();
  try {
    await localClient.query('BEGIN');
    await cloudClient.query('BEGIN');
    const cloudId = await pushOrcamento(localClient, cloudClient, orcamentoId);
    await cloudClient.query('COMMIT');
    await localClient.query('COMMIT');
    return cloudId;
  } catch (err) {
    await cloudClient.query('ROLLBACK');
    await localClient.query('ROLLBACK');
    await localPool.query(
      'UPDATE orcamentos SET pendente_sync = true WHERE id = $1',
      [orcamentoId]
    );
    return null;
  } finally {
    localClient.release();
    cloudClient.release();
  }
}

module.exports = {
  OFFLINE_ID_THRESHOLD,
  isHybridMode,
  isCloudAvailable,
  setCloudAvailable,
  getLastSyncSummary,
  buildLocalPoolConfig,
  buildCloudPoolConfig,
  testPool,
  ensureSyncSchema,
  runStartupSync,
  allocateOfflineId,
  tryPushCliente,
  tryPushOrcamento,
  tryPushOrcamentoPlanejado,
};
