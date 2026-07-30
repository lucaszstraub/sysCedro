# Deploy Vercel — SysCedro Web
#
# 1. Conecte o repositório na Vercel
# 2. Configure as variáveis de ambiente (Production + Preview)
# 3. Deploy
#
# Variáveis obrigatórias:
#   DATABASE_POOLER_URL   — connection string Supabase (session pooler)
#   DB_SSL=true
#   DB_CLOUD=true
#   DB_HYBRID=false
#   SESSION_SECRET        — string longa aleatória (assinatura de sessão)
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY  (ou SUPABASE_SECRET_KEY)
#
# Opcionais:
#   CORS_ORIGIN=https://seu-dominio.vercel.app
#   VITE_API_BASE=        — deixe vazio se front e API no mesmo domínio
#
# Dev local (web, sem Electron):
#   npm run web          — Vite :5173 + API :3001
#   Abra http://localhost:5173
#
# Dev Electron (inalterado):
#   npm run dev
