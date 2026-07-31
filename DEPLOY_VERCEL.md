# Deploy Vercel — SysCedro Web

## Importar o repositório

1. Vercel → **Add New Project** → importe `CedroMoveis/sysCedro`
2. Framework: **Other** (já definido em `vercel.json`)
3. Build Command: `npm run build:web` (automático)
4. Output Directory: `dist` (automático)
5. **Configure as Environment Variables antes do primeiro deploy** (abaixo)

## Variáveis obrigatórias (Production + Preview)

| Variável | Valor |
|----------|--------|
| `DATABASE_POOLER_URL` | URI do Session Pooler Supabase |
| `DB_SSL` | `true` |
| `DB_CLOUD` | `true` |
| `DB_HYBRID` | `false` |
| `SYS_CEDRO_WEB` | `1` |
| `SESSION_SECRET` | string longa aleatória |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service role (ou `SUPABASE_SECRET_KEY`) |
| `SUPABASE_SECRET_KEY` | se o app usar este nome |
| `SUPABASE_PUBLISHABLE_KEY` | chave publishable |

Opcionais (se não usar só a pooler URL): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

Via CLI (com login):

```bash
npx vercel login
npx vercel link
node scripts/configure-vercel-env.mjs
npx vercel --prod
```

## O que o deploy faz

- Instala deps com `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (não baixa binário Electron)
- Build do front: Vite → `dist/`
- API serverless: `/api/invoke` e `/api/health`
- SPA: rewrite de rotas para `index.html`

## Dev local

```bash
npm run web    # Vite :5173 + API :3001
npm run dev    # Electron
```
