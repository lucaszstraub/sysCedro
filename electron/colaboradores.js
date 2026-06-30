const { getPool } = require('./database');
const {
  isFuncaoComercial,
  sincronizarVendedorColaborador,
} = require('./colaboradorVendedor');
const { getSession, requireSession } = require('./auth');
const { userIsAdministrador } = require('./permissions');

const FUNCOES_COLABORADOR = [
  'vendedor',
  'vendedor_projetista',
  'gerente',
  'entrega',
  'montador',
  'administracao',
];

const TIPOS_BENEFICIO = ['VT', 'VA', 'VR', 'Outro'];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function assertAcesso() {
  requireSession();
  if (!userIsAdministrador(getSession())) {
    throw new Error('Acesso restrito à administração do sistema.');
  }
}

function isFuncaoValida(funcao) {
  return FUNCOES_COLABORADOR.includes(funcao);
}

function isTipoBeneficioValido(tipo) {
  return TIPOS_BENEFICIO.includes(String(tipo || '').trim());
}

function mapColaboradorRow(row) {
  return {
    ...row,
    salario_base: round2(row.salario_base),
    total_beneficios: round2(row.total_beneficios),
    remuneracao_total: round2(
      (Number(row.salario_base) || 0) + (Number(row.total_beneficios) || 0)
    ),
  };
}

function mapBeneficioRow(row) {
  return {
    ...row,
    valor: round2(row.valor),
  };
}

async function validarUsuarioDisponivel(client, usuarioId, colaboradorId = null) {
  if (!usuarioId) return;

  const usuario = await client.query(
    'SELECT id, ativo FROM usuarios WHERE id = $1',
    [usuarioId]
  );
  if (usuario.rowCount === 0) {
    throw new Error('Usuário selecionado não encontrado.');
  }
  if (!usuario.rows[0].ativo) {
    throw new Error('O usuário selecionado está inativo.');
  }

  const vinculo = await client.query(`
    SELECT id FROM colaboradores
    WHERE usuario_id = $1 AND ($2::int IS NULL OR id <> $2)
  `, [usuarioId, colaboradorId]);

  if (vinculo.rowCount > 0) {
    throw new Error('Este usuário já está vinculado a outro colaborador.');
  }
}

async function salvarBeneficios(client, colaboradorId, beneficios = []) {
  const idsManter = [];

  for (const item of beneficios) {
    const tipo = String(item.tipo || '').trim();
    if (!tipo) continue;
    if (!isTipoBeneficioValido(tipo)) {
      throw new Error(`Tipo de benefício inválido: ${tipo}`);
    }

    const valor = round2(item.valor);
    if (valor < 0) throw new Error('Valor do benefício não pode ser negativo.');

    const descricao = item.descricao?.trim() || null;
    const ativo = item.ativo !== false;

    if (item.id) {
      const atualizado = await client.query(`
        UPDATE colaborador_beneficios
        SET tipo = $1, descricao = $2, valor = $3, ativo = $4, atualizado_em = NOW()
        WHERE id = $5 AND colaborador_id = $6
        RETURNING id
      `, [tipo, descricao, valor, ativo, item.id, colaboradorId]);

      if (atualizado.rowCount > 0) {
        idsManter.push(atualizado.rows[0].id);
      }
      continue;
    }

    const inserido = await client.query(`
      INSERT INTO colaborador_beneficios (colaborador_id, tipo, descricao, valor, ativo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [colaboradorId, tipo, descricao, valor, ativo]);
    idsManter.push(inserido.rows[0].id);
  }

  if (idsManter.length > 0) {
    await client.query(`
      DELETE FROM colaborador_beneficios
      WHERE colaborador_id = $1 AND id <> ALL($2::int[])
    `, [colaboradorId, idsManter]);
  } else {
    await client.query(
      'DELETE FROM colaborador_beneficios WHERE colaborador_id = $1',
      [colaboradorId]
    );
  }
}

async function listColaboradores(busca = '') {
  assertAcesso();
  const db = getPool();
  const termo = `%${String(busca || '').trim()}%`;

  const result = await db.query(`
    SELECT
      c.id,
      c.nome,
      c.funcao,
      c.usuario_id,
      c.vendedor_id,
      c.email,
      c.telefone,
      c.salario_base,
      c.ativo,
      c.observacoes,
      c.criado_em,
      c.atualizado_em,
      u.login AS usuario_login,
      u.nome AS usuario_nome,
      COALESCE(SUM(b.valor) FILTER (WHERE b.ativo = true), 0) AS total_beneficios
    FROM colaboradores c
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    LEFT JOIN colaborador_beneficios b ON b.colaborador_id = c.id
    WHERE c.nome ILIKE $1
      OR COALESCE(u.nome, '') ILIKE $1
      OR COALESCE(u.login, '') ILIKE $1
    GROUP BY c.id, u.login, u.nome
    ORDER BY c.nome
  `, [termo]);

  return result.rows.map(mapColaboradorRow);
}

async function getColaborador(id) {
  assertAcesso();
  const db = getPool();

  const result = await db.query(`
    SELECT
      c.id,
      c.nome,
      c.funcao,
      c.usuario_id,
      c.vendedor_id,
      c.email,
      c.telefone,
      c.salario_base,
      c.ativo,
      c.observacoes,
      c.criado_em,
      c.atualizado_em,
      u.login AS usuario_login,
      u.nome AS usuario_nome,
      COALESCE(SUM(b.valor) FILTER (WHERE b.ativo = true), 0) AS total_beneficios
    FROM colaboradores c
    LEFT JOIN usuarios u ON u.id = c.usuario_id
    LEFT JOIN colaborador_beneficios b ON b.colaborador_id = c.id
    WHERE c.id = $1
    GROUP BY c.id, u.login, u.nome
  `, [id]);

  if (result.rowCount === 0) return null;

  const beneficios = await db.query(`
    SELECT id, colaborador_id, tipo, descricao, valor, ativo, criado_em, atualizado_em
    FROM colaborador_beneficios
    WHERE colaborador_id = $1
    ORDER BY tipo, id
  `, [id]);

  return {
    ...mapColaboradorRow(result.rows[0]),
    beneficios: beneficios.rows.map(mapBeneficioRow),
  };
}

async function listUsuariosParaColaborador(colaboradorId = null) {
  assertAcesso();
  const db = getPool();

  const result = await db.query(`
    SELECT u.id, u.login, u.nome, u.atribuicao, u.ativo
    FROM usuarios u
    WHERE u.ativo = true
      AND (
        u.id NOT IN (
          SELECT usuario_id FROM colaboradores
          WHERE usuario_id IS NOT NULL AND ($1::int IS NULL OR id <> $1)
        )
        OR u.id = (SELECT usuario_id FROM colaboradores WHERE id = $1)
      )
    ORDER BY u.nome
  `, [colaboradorId || null]);

  return result.rows;
}

async function createColaborador(data) {
  assertAcesso();
  const db = getPool();
  const client = await db.connect();

  const nome = data.nome?.trim();
  const funcao = data.funcao;
  const usuarioId = data.usuario_id ? Number(data.usuario_id) : null;
  const salarioBase = round2(data.salario_base);
  const email = data.email?.trim() || null;
  const telefone = data.telefone?.trim() || null;
  const observacoes = data.observacoes?.trim() || null;

  if (!nome) throw new Error('Informe o nome do colaborador.');
  if (!isFuncaoValida(funcao)) throw new Error('Selecione uma função válida.');
  if (salarioBase < 0) throw new Error('O salário não pode ser negativo.');

  try {
    await client.query('BEGIN');
    await validarUsuarioDisponivel(client, usuarioId);

    const result = await client.query(`
      INSERT INTO colaboradores (nome, funcao, usuario_id, email, telefone, salario_base, ativo, observacoes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [nome, funcao, usuarioId, email, telefone, salarioBase, data.ativo !== false, observacoes]);

    const colaboradorId = result.rows[0].id;
    await salvarBeneficios(client, colaboradorId, data.beneficios || []);

    if (isFuncaoComercial(funcao)) {
      await sincronizarVendedorColaborador(client, {
        id: colaboradorId,
        nome,
        funcao,
        usuario_id: usuarioId,
        email,
        telefone,
        ativo: data.ativo !== false,
        vendedor_id: null,
      });
    }

    await client.query('COMMIT');
    return getColaborador(colaboradorId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateColaborador(id, data) {
  assertAcesso();
  const db = getPool();
  const client = await db.connect();

  const existente = await getColaborador(id);
  if (!existente) throw new Error('Colaborador não encontrado.');

  const nome = data.nome?.trim();
  const funcao = data.funcao;
  const usuarioId = data.usuario_id ? Number(data.usuario_id) : null;
  const salarioBase = round2(data.salario_base);
  const email = data.email?.trim() || null;
  const telefone = data.telefone?.trim() || null;
  const observacoes = data.observacoes?.trim() || null;

  if (!nome) throw new Error('Informe o nome do colaborador.');
  if (!isFuncaoValida(funcao)) throw new Error('Selecione uma função válida.');
  if (salarioBase < 0) throw new Error('O salário não pode ser negativo.');

  try {
    await client.query('BEGIN');
    await validarUsuarioDisponivel(client, usuarioId, id);

    await client.query(`
      UPDATE colaboradores
      SET nome = $1,
          funcao = $2,
          usuario_id = $3,
          email = $4,
          telefone = $5,
          salario_base = $6,
          ativo = $7,
          observacoes = $8,
          atualizado_em = NOW()
      WHERE id = $9
    `, [nome, funcao, usuarioId, email, telefone, salarioBase, data.ativo !== false, observacoes, id]);

    await salvarBeneficios(client, id, data.beneficios || []);

    const colaboradorAtual = await client.query(`
      SELECT id, nome, funcao, usuario_id, vendedor_id, email, telefone, ativo
      FROM colaboradores WHERE id = $1
    `, [id]);

    await sincronizarVendedorColaborador(client, colaboradorAtual.rows[0]);

    await client.query('COMMIT');
    return getColaborador(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteColaborador(id) {
  assertAcesso();
  const db = getPool();
  const client = await db.connect();

  const existente = await getColaborador(id);
  if (!existente) throw new Error('Colaborador não encontrado.');

  try {
    await client.query('BEGIN');

    await client.query(`
      UPDATE colaboradores
      SET ativo = false, atualizado_em = NOW()
      WHERE id = $1
    `, [id]);

    if (existente.vendedor_id) {
      await client.query(
        'UPDATE vendedores SET ativo = false WHERE id = $1',
        [existente.vendedor_id]
      );
    }

    await client.query('COMMIT');
    return { id, ativo: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  FUNCOES_COLABORADOR,
  TIPOS_BENEFICIO,
  listColaboradores,
  getColaborador,
  listUsuariosParaColaborador,
  createColaborador,
  updateColaborador,
  deleteColaborador,
};
