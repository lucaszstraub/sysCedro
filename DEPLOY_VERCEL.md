# Deploy Vercel — SysCedro Web

## 1. Login e link do projeto

```bash
npx vercel login --github --future
npx vercel link
```

Escolha o repositório `lucaszstraub/sysCedro` (ou importe na UI da Vercel).

## 2. Variáveis de ambiente (a partir do `.env` local)

```bash
node scripts/configure-vercel-env.mjs
```

O script envia para **Production** e **Preview**:

- `DATABASE_POOLER_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_SSL=true`, `DB_CLOUD=true`, `DB_HYBRID=false`, `SYS_CEDRO_WEB=1`
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET` (gera automaticamente se ainda não existir no `.env`)

## 3. Deploy

Na Vercel: **Deploy** do branch `main`, ou:

```bash
npx vercel --prod
```

## Dev local

```bash
npm run web          # Vite :5173 + API :3001
npm run dev          # Electron (inalterado)
```

Opcional: `CORS_ORIGIN=https://seu-dominio.vercel.app`
