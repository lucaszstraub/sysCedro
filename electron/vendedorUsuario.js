const { getPool } = require('./database');
const { ATRIBUICOES, userIsGerenteOuAdministrador } = require('./permissions');

const PERFIS_VENDEDOR = [ATRIBUICOES.VENDEDOR, ATRIBUICOES.VENDEDOR_PROJETISTA];

function isPerfilVendedorRestrito(user) {
  if (!user || user.is_master) return false;
  return PERFIS_VENDEDOR.includes(user.atribuicao);
}

function classificacaoPorAtribuicao(atribuicao) {
  if (atribuicao === ATRIBUICOES.VENDEDOR_PROJETISTA) return 'planejados';
  return 'moveis_soltos';
}

async function ensureVendedorVinculado(userId, client = null) {
  const db = client || getPool();
  const userResult = await db.query('SELECT * FROM usuarios WHERE id = $1', [userId]);
  if (userResult.rowCount === 0) return null;

  const user = userResult.rows[0];
  if (!PERFIS_VENDEDOR.includes(user.atribuicao)) {
    return user;
  }

  const classificacao = classificacaoPorAtribuicao(user.atribuicao);
  const nome = user.nome?.trim();
  if (!nome) return user;

  let vendedorId = user.vendedor_id;

  if (!vendedorId) {
    const byUsuario = await db.query(
      'SELECT id FROM vendedores WHERE usuario_id = $1 LIMIT 1',
      [userId]
    );
    if (byUsuario.rowCount > 0) {
      vendedorId = byUsuario.rows[0].id;
    }
  }

  if (!vendedorId) {
    const byNome = await db.query(
      `SELECT id FROM vendedores
       WHERE LOWER(TRIM(nome)) = LOWER(TRIM($1))
         AND classificacao = $2
         AND usuario_id IS NULL
       ORDER BY id
       LIMIT 1`,
      [nome, classificacao]
    );
    if (byNome.rowCount > 0) {
      vendedorId = byNome.rows[0].id;
    }
  }

  if (vendedorId) {
    await db.query(
      `UPDATE vendedores SET
        nome = $2,
        classificacao = $3,
        usuario_id = $4,
        ativo = true
       WHERE id = $1`,
      [vendedorId, nome, classificacao, userId]
    );
    await db.query(
      'UPDATE usuarios SET vendedor_id = $2, atualizado_em = NOW() WHERE id = $1',
      [userId, vendedorId]
    );
    return { ...user, vendedor_id: vendedorId };
  }

  const created = await db.query(
    `INSERT INTO vendedores (nome, classificacao, usuario_id, ativo)
     VALUES ($1, $2, $3, true)
     RETURNING id`,
    [nome, classificacao, userId]
  );
  vendedorId = created.rows[0].id;
  await db.query(
    'UPDATE usuarios SET vendedor_id = $2, atualizado_em = NOW() WHERE id = $1',
    [userId, vendedorId]
  );
  return { ...user, vendedor_id: vendedorId };
}

async function ensureVendedoresUsuariosExistentes() {
  const db = getPool();
  const result = await db.query(`
    SELECT id FROM usuarios
    WHERE ativo = true AND atribuicao IN ('vendedor', 'vendedor_projetista')
  `);
  for (const row of result.rows) {
    await ensureVendedorVinculado(row.id);
  }
}

function getVendedorIdFiltro(user) {
  if (!isPerfilVendedorRestrito(user)) return null;
  return user.vendedor_id ? Number(user.vendedor_id) : null;
}

function aplicarVendedorIdSessao(data, user) {
  const vendedorId = getVendedorIdFiltro(user);
  if (!vendedorId) return data;
  return { ...data, vendedor_id: vendedorId };
}

function assertAcessoVendedorRecurso(user, recursoVendedorId, label = 'registro') {
  if (!isPerfilVendedorRestrito(user)) return;
  if (!user.vendedor_id) {
    throw new Error('Seu usuário não está vinculado a um vendedor. Contate o administrador.');
  }
  if (!recursoVendedorId || Number(recursoVendedorId) !== Number(user.vendedor_id)) {
    throw new Error(`Você não tem permissão para acessar este ${label}.`);
  }
}

function assertVendaAcessivel(user, vendaRow, label = 'venda') {
  assertAcessoVendedorRecurso(user, vendaRow.vendedor_id, label);
  if (vendaRow.desativada && !userIsGerenteOuAdministrador(user)) {
    throw new Error('Venda não encontrada.');
  }
}

function buildFiltroVendedorSql(user, alias, params) {
  if (!isPerfilVendedorRestrito(user)) return { sql: '', params };
  if (!user.vendedor_id) {
    params.push(-1);
    return {
      sql: ` AND ${alias}.vendedor_id = $${params.length}`,
      params,
    };
  }
  params.push(Number(user.vendedor_id));
  return {
    sql: ` AND ${alias}.vendedor_id = $${params.length}`,
    params,
  };
}

function buildFiltroVendasAtivasSql(alias = 'v') {
  return ` AND COALESCE(${alias}.desativada, false) = false`;
}

module.exports = {
  isPerfilVendedorRestrito,
  classificacaoPorAtribuicao,
  ensureVendedorVinculado,
  ensureVendedoresUsuariosExistentes,
  getVendedorIdFiltro,
  aplicarVendedorIdSessao,
  assertAcessoVendedorRecurso,
  assertVendaAcessivel,
  buildFiltroVendedorSql,
  buildFiltroVendasAtivasSql,
};
