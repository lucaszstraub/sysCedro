-- SysCedro — suporte a orçamentos offline + sincronização com Supabase
-- Execute após schema.sql (local e nuvem).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- IDs locais offline começam em 1 bilhão (não colidem com IDs da nuvem)
CREATE SEQUENCE IF NOT EXISTS offline_entity_seq START 1000000000;

CREATE TABLE IF NOT EXISTS sync_controle (
  chave VARCHAR(80) PRIMARY KEY,
  valor TEXT,
  atualizado_em TIMESTAMP DEFAULT NOW()
);

ALTER TABLE venda_itens ADD COLUMN IF NOT EXISTS quantidade_peca_loja INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sync_id_map (
  id SERIAL PRIMARY KEY,
  tabela VARCHAR(80) NOT NULL,
  local_id INTEGER NOT NULL,
  cloud_id INTEGER NOT NULL,
  sync_uuid UUID NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW(),
  UNIQUE (tabela, local_id),
  UNIQUE (tabela, cloud_id),
  UNIQUE (sync_uuid)
);

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS sync_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS pendente_sync BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE orcamentos SET sync_uuid = gen_random_uuid() WHERE sync_uuid IS NULL;
ALTER TABLE orcamentos ALTER COLUMN sync_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_sync_uuid ON orcamentos(sync_uuid);

ALTER TABLE orcamento_ambientes ADD COLUMN IF NOT EXISTS sync_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE orcamento_ambientes ADD COLUMN IF NOT EXISTS pendente_sync BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE orcamento_ambientes SET sync_uuid = gen_random_uuid() WHERE sync_uuid IS NULL;
ALTER TABLE orcamento_ambientes ALTER COLUMN sync_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_ambientes_sync_uuid ON orcamento_ambientes(sync_uuid);

ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS sync_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE orcamento_itens ADD COLUMN IF NOT EXISTS pendente_sync BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE orcamento_itens SET sync_uuid = gen_random_uuid() WHERE sync_uuid IS NULL;
ALTER TABLE orcamento_itens ALTER COLUMN sync_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_itens_sync_uuid ON orcamento_itens(sync_uuid);

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS sync_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pendente_sync BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE clientes SET sync_uuid = gen_random_uuid() WHERE sync_uuid IS NULL;
ALTER TABLE clientes ALTER COLUMN sync_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_sync_uuid ON clientes(sync_uuid);

ALTER TABLE orcamentos_planejados ADD COLUMN IF NOT EXISTS sync_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE orcamentos_planejados ADD COLUMN IF NOT EXISTS pendente_sync BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE orcamentos_planejados SET sync_uuid = gen_random_uuid() WHERE sync_uuid IS NULL;
ALTER TABLE orcamentos_planejados ALTER COLUMN sync_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamentos_planejados_sync_uuid ON orcamentos_planejados(sync_uuid);

ALTER TABLE orcamento_planejado_ambientes ADD COLUMN IF NOT EXISTS sync_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE orcamento_planejado_ambientes ADD COLUMN IF NOT EXISTS pendente_sync BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE orcamento_planejado_ambientes SET sync_uuid = gen_random_uuid() WHERE sync_uuid IS NULL;
ALTER TABLE orcamento_planejado_ambientes ALTER COLUMN sync_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orc_planejado_ambientes_sync_uuid ON orcamento_planejado_ambientes(sync_uuid);

ALTER TABLE orcamento_planejado_itens ADD COLUMN IF NOT EXISTS sync_uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE orcamento_planejado_itens ADD COLUMN IF NOT EXISTS pendente_sync BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE orcamento_planejado_itens SET sync_uuid = gen_random_uuid() WHERE sync_uuid IS NULL;
ALTER TABLE orcamento_planejado_itens ALTER COLUMN sync_uuid SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orc_planejado_itens_sync_uuid ON orcamento_planejado_itens(sync_uuid);
