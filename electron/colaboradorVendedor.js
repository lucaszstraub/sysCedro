const { getPool } = require('./database');

const FUNCOES_COM_VENDEDOR = ['vendedor', 'vendedor_projetista'];

function classificacaoPorFuncao(funcao) {
  if (funcao === 'vendedor_projetista') return 'planejados';
  if (funcao === 'vendedor') return 'moveis_soltos';
  return null;
}

function isFuncaoComercial(funcao) {
  return FUNCOES_COM_VENDEDOR.includes(funcao);
}

async function buscarVendedorExistente(client, { vendedorId, usuarioId, nome, classificacao }) {
  if (vendedorId) {
    const porId = await client.query('SELECT id FROM vendedores WHERE id = $1', [vendedorId]);
    if (porId.rowCount > 0) return porId.rows[0].id;
  }

  if (usuarioId) {
    const porUsuario = await client.query(`
      SELECT v.id
      FROM vendedores v
      WHERE v.usuario_id = $1
         OR v.id = (SELECT u.vendedor_id FROM usuarios u WHERE u.id = $1)
      ORDER BY v.id
      LIMIT 1
    `, [usuarioId]);
    if (porUsuario.rowCount > 0) return porUsuario.rows[0].id;

    const porColaborador = await client.query(`
      SELECT vendedor_id AS id FROM colaboradores
      WHERE usuario_id = $1 AND vendedor_id IS NOT NULL
      LIMIT 1
    `, [usuarioId]);
    if (porColaborador.rowCount > 0) return porColaborador.rows[0].id;
  }

  if (nome && classificacao) {
    const porNome = await client.query(`
      SELECT id FROM vendedores
      WHERE LOWER(TRIM(nome)) = LOWER(TRIM($1))
        AND classificacao = $2
      ORDER BY id
      LIMIT 1
    `, [nome, classificacao]);
    if (porNome.rowCount > 0) return porNome.rows[0].id;
  }

  return null;
}

async function sincronizarVendedorColaborador(client, colaborador) {
  const classificacao = classificacaoPorFuncao(colaborador.funcao);
  const ativo = colaborador.ativo !== false;
  const nome = colaborador.nome?.trim();
  const usuarioId = colaborador.usuario_id ? Number(colaborador.usuario_id) : null;

  if (!classificacao) {
    if (colaborador.vendedor_id) {
      await client.query(
        'UPDATE vendedores SET ativo = false WHERE id = $1',
        [colaborador.vendedor_id]
      );
    }
    await client.query(
      'UPDATE colaboradores SET vendedor_id = NULL, atualizado_em = NOW() WHERE id = $1',
      [colaborador.id]
    );
    return null;
  }

  if (!nome) throw new Error('Informe o nome do colaborador.');

  let vendedorId = await buscarVendedorExistente(client, {
    vendedorId: colaborador.vendedor_id,
    usuarioId,
    nome,
    classificacao,
  });

  if (vendedorId) {
    await client.query(`
      UPDATE vendedores
      SET nome = $2,
          email = $3,
          telefone = $4,
          classificacao = $5,
          usuario_id = $6,
          ativo = $7
      WHERE id = $1
    `, [
      vendedorId,
      nome,
      colaborador.email?.trim() || null,
      colaborador.telefone?.trim() || null,
      classificacao,
      usuarioId,
      ativo,
    ]);
  } else {
    const criado = await client.query(`
      INSERT INTO vendedores (nome, email, telefone, classificacao, usuario_id, ativo)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      nome,
      colaborador.email?.trim() || null,
      colaborador.telefone?.trim() || null,
      classificacao,
      usuarioId,
      ativo,
    ]);
    vendedorId = criado.rows[0].id;
  }

  if (usuarioId) {
    await client.query(
      'UPDATE usuarios SET vendedor_id = $2, atualizado_em = NOW() WHERE id = $1',
      [usuarioId, vendedorId]
    );
  }

  await client.query(
    'UPDATE colaboradores SET vendedor_id = $2, atualizado_em = NOW() WHERE id = $1',
    [colaborador.id, vendedorId]
  );

  return vendedorId;
}

async function sincronizarVendedoresColaboradoresExistentes() {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const colaboradores = await client.query(`
      SELECT id, nome, funcao, usuario_id, vendedor_id, ativo
      FROM colaboradores
      WHERE funcao IN ('vendedor', 'vendedor_projetista')
      ORDER BY id
    `);

    for (const row of colaboradores.rows) {
      await sincronizarVendedorColaborador(client, row);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  FUNCOES_COM_VENDEDOR,
  isFuncaoComercial,
  classificacaoPorFuncao,
  sincronizarVendedorColaborador,
  sincronizarVendedoresColaboradoresExistentes,
};
