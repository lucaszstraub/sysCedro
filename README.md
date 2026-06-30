# SysCedro WMS

Sistema de Gerenciamento de Armazém (WMS) para loja de móveis, desenvolvido com **Electron**, **React** e **PostgreSQL**.

Interface totalmente em **português brasileiro**.

## Requisitos

- Node.js 18+
- PostgreSQL 14+ (usuário `postgres`, senha `root` por padrão no desenvolvimento)
- Git

## Instalação (clone novo)

```bash
git clone https://github.com/lucaszstraub/sysCedro.git
cd sysCedro
npm ci
npm run db:setup
```

Use `npm ci` (e não `npm install`) para instalar **exatamente** as versões definidas em `package-lock.json`.

## Instalação (projeto já clonado)

```bash
npm ci
npm run db:setup
```

## Executar em desenvolvimento

```bash
npm run dev
```

Inicia o Vite (interface React) e o Electron simultaneamente.

## Executar em produção

```bash
npm start
```

## Configuração do banco

As credenciais padrão estão em `electron/database.js`:

| Parâmetro | Valor            |
|-----------|------------------|
| Host      | localhost        |
| Porta     | 5432             |
| Usuário   | postgres         |
| Senha     | root             |
| Banco     | sys_cedro_wms    |

O comando `npm run db:setup` cria o banco (se não existir) e aplica `database/schema.sql`.

## Estrutura do projeto

```
sysCedro/
├── electron/          # Processo principal Electron + lógica de negócio
├── database/          # Schema SQL
├── src/               # Interface React
├── scripts/           # Setup do banco
├── assets/            # Marca e recursos
├── package.json       # Dependências
└── package-lock.json  # Versões exatas das bibliotecas
```

## O que não vai para o Git

- `node_modules/` — reinstalado com `npm ci`
- `dist/` — gerado com `npm run build`
- `data/` — fotos de produtos e anexos locais

## Dados de exemplo

O schema inclui categorias, fornecedores, localizações e produtos de exemplo para testes.
