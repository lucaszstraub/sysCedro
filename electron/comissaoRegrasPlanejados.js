const { getPool } = require('./database');
const { getSession } = require('./auth');
const { ATRIBUICOES } = require('./permissions');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function assertAdministrador(session = getSession()) {
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');
  if (!session.is_master && session.atribuicao !== ATRIBUICOES.ADMINISTRACAO) {
    throw new Error('Acesso restrito à administração do sistema.');
  }
}

function mapRegraRow(row) {
  if (!row) return null;
  return {
    ...row,
    valor_limite: round2(row.valor_limite),
    percentual_ate_limite: round4(row.percentual_ate_limite),
    percentual_acima_limite: round4(row.percentual_acima_limite),
  };
}

function calcularComissaoPlanejado(totalVendas, regra) {
  const total = round2(totalVendas);
  const limite = round2(regra?.valor_limite ?? 100000);
  const pctAte = round4(regra?.percentual_ate_limite ?? 5);
  const pctAcima = round4(regra?.percentual_acima_limite ?? 10);

  if (total <= 0) {
    return {
      total_vendas: 0,
      valor_limite: limite,
      percentual_ate_limite: pctAte,
      percentual_acima_limite: pctAcima,
      base_ate_limite: 0,
      base_acima_limite: 0,
      valor_faixa_ate: 0,
      valor_faixa_acima: 0,
      valor_comissao: 0,
    };
  }

  const baseAte = round2(Math.min(total, limite));
  const baseAcima = round2(Math.max(total - limite, 0));
  const valorFaixaAte = round2(baseAte * pctAte / 100);
  const valorFaixaAcima = round2(baseAcima * pctAcima / 100);

  return {
    total_vendas: total,
    valor_limite: limite,
    percentual_ate_limite: pctAte,
    percentual_acima_limite: pctAcima,
    base_ate_limite: baseAte,
    base_acima_limite: baseAcima,
    valor_faixa_ate: valorFaixaAte,
    valor_faixa_acima: valorFaixaAcima,
    valor_comissao: round2(valorFaixaAte + valorFaixaAcima),
  };
}

async function getComissaoRegraPlanejados() {
  assertAdministrador();
  const db = getPool();
  const result = await db.query('SELECT * FROM comissao_regras_planejados WHERE id = 1');
  return result.rowCount > 0 ? mapRegraRow(result.rows[0]) : null;
}

async function salvarComissaoRegraPlanejados(data) {
  assertAdministrador();

  const valorLimite = Number(data.valor_limite);
  const pctAte = Number(data.percentual_ate_limite);
  const pctAcima = Number(data.percentual_acima_limite);

  if (!Number.isFinite(valorLimite) || valorLimite <= 0) {
    throw new Error('Informe o valor limite do período maior que zero.');
  }
  if (!Number.isFinite(pctAte) || pctAte < 0) {
    throw new Error('Informe o percentual até o limite.');
  }
  if (!Number.isFinite(pctAcima) || pctAcima < 0) {
    throw new Error('Informe o percentual acima do limite.');
  }

  const db = getPool();
  const result = await db.query(`
    INSERT INTO comissao_regras_planejados (
      id, valor_limite, percentual_ate_limite, percentual_acima_limite, observacoes, atualizado_em
    )
    VALUES (1, $1, $2, $3, $4, NOW())
    ON CONFLICT (id) DO UPDATE SET
      valor_limite = EXCLUDED.valor_limite,
      percentual_ate_limite = EXCLUDED.percentual_ate_limite,
      percentual_acima_limite = EXCLUDED.percentual_acima_limite,
      observacoes = EXCLUDED.observacoes,
      atualizado_em = NOW()
    RETURNING *
  `, [
    valorLimite,
    pctAte,
    pctAcima,
    data.observacoes?.trim() || null,
  ]);

  return mapRegraRow(result.rows[0]);
}

async function getRegraPlanejados() {
  const db = getPool();
  const result = await db.query('SELECT * FROM comissao_regras_planejados WHERE id = 1');
  return result.rowCount > 0 ? mapRegraRow(result.rows[0]) : mapRegraRow({
    valor_limite: 100000,
    percentual_ate_limite: 5,
    percentual_acima_limite: 10,
  });
}

module.exports = {
  assertAdministrador,
  calcularComissaoPlanejado,
  getComissaoRegraPlanejados,
  salvarComissaoRegraPlanejados,
  getRegraPlanejados,
};
