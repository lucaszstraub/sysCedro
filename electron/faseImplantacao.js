const { getPool } = require('./database');
const { getSession } = require('./auth');

const CHAVE = 'fase_implantacao';

async function isFaseImplantacaoAtiva(client) {
  const db = client || getPool();
  const result = await db.query(
    'SELECT valor FROM sync_controle WHERE chave = $1',
    [CHAVE]
  );
  return result.rows[0]?.valor === 'true';
}

async function getFaseImplantacao() {
  return { ativa: await isFaseImplantacaoAtiva() };
}

async function setFaseImplantacao(ativa) {
  const session = getSession();
  if (!session?.is_master) {
    throw new Error('Apenas o usuário master pode alterar a fase de implantação.');
  }

  const db = getPool();
  await db.query(`
    INSERT INTO sync_controle (chave, valor, atualizado_em)
    VALUES ($1, $2, NOW())
    ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()
  `, [CHAVE, ativa ? 'true' : 'false']);

  // Apenas alterna o flag — nunca apaga vendas, entregas, estoque ou movimentações.
  return { ativa: Boolean(ativa) };
}

async function backfillExpedicoesImplantacao() {
  const session = getSession();
  if (!session?.is_master) {
    throw new Error('Apenas o usuário master pode executar esta ação.');
  }
  if (!await isFaseImplantacaoAtiva()) {
    throw new Error('Ative a fase de implantação antes de incluir pedidos no kanban.');
  }

  const entregas = require('./entregas');
  return entregas.backfillExpedicoesImplantacao();
}

module.exports = {
  isFaseImplantacaoAtiva,
  getFaseImplantacao,
  setFaseImplantacao,
  backfillExpedicoesImplantacao,
};
