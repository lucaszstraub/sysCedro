-- =============================================================================
-- SysCedro WMS — Pós-configuração no Supabase
-- =============================================================================
--
-- ORDEM NO SQL EDITOR DO SUPABASE:
--
--   1) Execute TODO o arquivo database/schema.sql (cria tabelas e índices)
--   2) Execute database/sync-offline.sql (colunas de sincronização offline)
--   3) Execute ESTE arquivo (segurança + storage)
--   4) (Opcional) Importe dados locais com pg_dump / psql
--   5) Ajuste sequences após importar dados (bloco no final deste arquivo)
--
-- Região recomendada do projeto: South America (São Paulo)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Row Level Security (RLS) em todas as tabelas do schema public
--    O app Electron usa conexão postgres direta (bypassa RLS).
--    RLS protege a Data API caso alguém use a chave anon no futuro.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Nega acesso via roles da API pública até políticas explícitas existirem
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "deny_anon" ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY "deny_anon" ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)',
      r.tablename
    );
    EXECUTE format('DROP POLICY IF EXISTS "deny_authenticated" ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY "deny_authenticated" ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      r.tablename
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Storage — buckets para arquivos que hoje ficam no disco do Electron
--    (fotos de produtos e anexos de vendas planejadas)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'produtos-fotos',
    'produtos-fotos',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'vendas-planejados-anexos',
    'vendas-planejados-anexos',
    false,
    26214400,
    ARRAY['image/jpeg', 'image/png', 'application/pdf']::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública das fotos de produto (bucket público)
DROP POLICY IF EXISTS "produtos_fotos_public_read" ON storage.objects;
CREATE POLICY "produtos_fotos_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'produtos-fotos');

-- Upload/atualização de fotos apenas via service_role (backend Electron)
DROP POLICY IF EXISTS "produtos_fotos_service_write" ON storage.objects;
CREATE POLICY "produtos_fotos_service_write"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'produtos-fotos')
WITH CHECK (bucket_id = 'produtos-fotos');

-- Anexos de vendas planejadas: somente service_role
DROP POLICY IF EXISTS "anexos_service_all" ON storage.objects;
CREATE POLICY "anexos_service_all"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'vendas-planejados-anexos')
WITH CHECK (bucket_id = 'vendas-planejados-anexos');

-- -----------------------------------------------------------------------------
-- 3. Após importar dados do Postgres local, sincronize sequences (SERIAL)
--    Execute uma vez depois do pg_dump de dados.
-- -----------------------------------------------------------------------------
-- Descomente e rode após importar, ou execute tabela a tabela conforme necessário:

/*
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    JOIN pg_depend d ON d.objid = c.oid AND d.deptype = 'a'
    JOIN pg_class seq ON seq.oid = d.refobjid AND seq.relkind = 'S'
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND pg_get_serial_sequence(format('public.%I', c.relname), a.attname) IS NOT NULL
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT MAX(%I) FROM public.%I), 1))',
      'public.' || r.table_name, r.column_name, r.column_name, r.table_name
    );
  END LOOP;
END $$;
*/

-- -----------------------------------------------------------------------------
-- 4. Conferência rápida
-- -----------------------------------------------------------------------------
SELECT 'Tabelas' AS tipo, COUNT(*)::text AS total FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'Buckets', COUNT(*)::text FROM storage.buckets WHERE id IN ('produtos-fotos', 'vendas-planejados-anexos');
