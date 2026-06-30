const { getPool } = require('./database');
const { getSession } = require('./auth');
const { ATRIBUICOES } = require('./permissions');

const PERFIS = ['vendedor', 'gerente'];
const TIPOS_COMISSAO = ['percentual_fixo', 'markup_como_percentual'];

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

function normalizarTipo(tipo, campo) {
  if (!TIPOS_COMISSAO.includes(tipo)) {
    throw new Error(`Tipo de comissão inválido em ${campo}.`);
  }
  return tipo;
}

function mapRegraRow(row) {
  return {
    ...row,
    markup_minimo: round4(row.markup_minimo),
    comissao_abaixo_valor: row.comissao_abaixo_valor != null ? round4(row.comissao_abaixo_valor) : null,
    comissao_acima_valor: row.comissao_acima_valor != null ? round4(row.comissao_acima_valor) : null,
  };
}

function calcularPercentualComissao(markupReal, regra) {
  if (markupReal == null || !regra) return null;
  const markup = Number(markupReal);
  if (!Number.isFinite(markup) || markup <= 0) return null;

  const limite = Number(regra.markup_minimo) || 0;
  const acima = markup >= limite;
  const tipo = acima ? regra.comissao_acima_tipo : regra.comissao_abaixo_tipo;

  if (tipo === 'markup_como_percentual') {
    return round4(markup);
  }

  const valor = acima ? regra.comissao_acima_valor : regra.comissao_abaixo_valor;
  return round4(Number(valor) || 0);
}

function calcularValorComissao(receitaLiquidaReal, percentualComissao) {
  const base = Number(receitaLiquidaReal) || 0;
  const pct = Number(percentualComissao) || 0;
  if (base <= 0 || pct <= 0) return 0;
  return round2(base * pct / 100);
}

function descreverTipoComissao(tipo, valor) {
  if (tipo === 'markup_como_percentual') {
    return 'Igual ao markup (ex.: markup 2,00 → comissão 2%)';
  }
  return `${round4(valor)}% fixo`;
}

async function listComissaoRegras() {
  assertAdministrador();
  const db = getPool();
  const result = await db.query(`
    SELECT cr.*, vd.nome AS beneficiario_nome
    FROM comissao_regras cr
    LEFT JOIN vendedores vd ON vd.id = cr.beneficiario_vendedor_id
    ORDER BY
      CASE cr.perfil WHEN 'vendedor' THEN 0 WHEN 'gerente' THEN 1 ELSE 2 END
  `);
  return result.rows.map(mapRegraRow);
}

async function getComissaoRegra(perfil) {
  assertAdministrador();
  const db = getPool();
  const result = await db.query(`
    SELECT cr.*, vd.nome AS beneficiario_nome
    FROM comissao_regras cr
    LEFT JOIN vendedores vd ON vd.id = cr.beneficiario_vendedor_id
    WHERE cr.perfil = $1
  `, [perfil]);
  return result.rowCount > 0 ? mapRegraRow(result.rows[0]) : null;
}

async function salvarComissaoRegra(data) {
  assertAdministrador();
  const perfil = data.perfil;
  if (!PERFIS.includes(perfil)) {
    throw new Error('Perfil de comissão inválido.');
  }

  const markupMinimo = Number(data.markup_minimo);
  if (!Number.isFinite(markupMinimo) || markupMinimo <= 0) {
    throw new Error('Informe um markup mínimo maior que zero.');
  }

  const comissaoAbaixoTipo = normalizarTipo(data.comissao_abaixo_tipo, 'comissão abaixo do markup');
  const comissaoAcimaTipo = normalizarTipo(data.comissao_acima_tipo, 'comissão acima do markup');

  const comissaoAbaixoValor = comissaoAbaixoTipo === 'percentual_fixo'
    ? Number(data.comissao_abaixo_valor)
    : null;
  const comissaoAcimaValor = comissaoAcimaTipo === 'percentual_fixo'
    ? Number(data.comissao_acima_valor)
    : null;

  if (comissaoAbaixoTipo === 'percentual_fixo' && (!Number.isFinite(comissaoAbaixoValor) || comissaoAbaixoValor < 0)) {
    throw new Error('Informe o percentual fixo para markup abaixo do mínimo.');
  }
  if (comissaoAcimaTipo === 'percentual_fixo' && (!Number.isFinite(comissaoAcimaValor) || comissaoAcimaValor < 0)) {
    throw new Error('Informe o percentual fixo para markup acima ou igual ao mínimo.');
  }

  let beneficiarioVendedorId = data.beneficiario_vendedor_id
    ? Number(data.beneficiario_vendedor_id)
    : null;
  if (perfil === 'gerente' && beneficiarioVendedorId) {
    const db = getPool();
    const v = await db.query('SELECT id FROM vendedores WHERE id = $1 AND ativo = true', [beneficiarioVendedorId]);
    if (v.rowCount === 0) throw new Error('Vendedor beneficiário da gerência não encontrado.');
  } else if (perfil === 'vendedor') {
    beneficiarioVendedorId = null;
  }

  const db = getPool();
  const result = await db.query(`
    INSERT INTO comissao_regras (
      perfil, markup_minimo,
      comissao_abaixo_tipo, comissao_abaixo_valor,
      comissao_acima_tipo, comissao_acima_valor,
      beneficiario_vendedor_id, observacoes, atualizado_em
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (perfil) DO UPDATE SET
      markup_minimo = EXCLUDED.markup_minimo,
      comissao_abaixo_tipo = EXCLUDED.comissao_abaixo_tipo,
      comissao_abaixo_valor = EXCLUDED.comissao_abaixo_valor,
      comissao_acima_tipo = EXCLUDED.comissao_acima_tipo,
      comissao_acima_valor = EXCLUDED.comissao_acima_valor,
      beneficiario_vendedor_id = EXCLUDED.beneficiario_vendedor_id,
      observacoes = EXCLUDED.observacoes,
      atualizado_em = NOW()
    RETURNING *
  `, [
    perfil,
    markupMinimo,
    comissaoAbaixoTipo,
    comissaoAbaixoValor,
    comissaoAcimaTipo,
    comissaoAcimaValor,
    beneficiarioVendedorId,
    data.observacoes?.trim() || null,
  ]);

  return mapRegraRow(result.rows[0]);
}

async function getRegrasMap() {
  const db = getPool();
  const result = await db.query('SELECT * FROM comissao_regras');
  const map = {};
  for (const row of result.rows) {
    map[row.perfil] = mapRegraRow(row);
  }
  if (!map.vendedor) {
    map.vendedor = mapRegraRow({
      perfil: 'vendedor',
      markup_minimo: 1.75,
      comissao_abaixo_tipo: 'percentual_fixo',
      comissao_abaixo_valor: 1,
      comissao_acima_tipo: 'markup_como_percentual',
      comissao_acima_valor: null,
      beneficiario_vendedor_id: null,
    });
  }
  if (!map.gerente) {
    map.gerente = mapRegraRow({
      perfil: 'gerente',
      markup_minimo: 1.75,
      comissao_abaixo_tipo: 'percentual_fixo',
      comissao_abaixo_valor: 0.5,
      comissao_acima_tipo: 'percentual_fixo',
      comissao_acima_valor: 0.8,
      beneficiario_vendedor_id: null,
    });
  }
  return map;
}

module.exports = {
  PERFIS,
  TIPOS_COMISSAO,
  assertAdministrador,
  calcularPercentualComissao,
  calcularValorComissao,
  descreverTipoComissao,
  listComissaoRegras,
  getComissaoRegra,
  salvarComissaoRegra,
  getRegrasMap,
};
