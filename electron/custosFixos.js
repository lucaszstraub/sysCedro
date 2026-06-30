const { getPool } = require('./database');
const { getSession, requireSession } = require('./auth');
const { userIsAdministrador } = require('./permissions');

const MESES_LABEL = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function assertAcesso() {
  requireSession();
  if (!userIsAdministrador(getSession())) {
    throw new Error('Acesso restrito à administração do sistema.');
  }
}

function normalizarAno(ano) {
  const n = Number(ano);
  if (!n || n < 2000 || n > 2100) {
    throw new Error('Informe um ano de exercício válido.');
  }
  return n;
}

function normalizarMes(mes) {
  const n = Number(mes);
  if (!n || n < 1 || n > 12) {
    throw new Error('Informe um mês válido.');
  }
  return n;
}

function mapTemplateRow(row) {
  return {
    ...row,
    valor_padrao: round2(row.valor_padrao),
  };
}

function mapMensalRow(row) {
  return {
    ...row,
    valor: round2(row.valor),
  };
}

async function listarAnosComDados(client) {
  const result = await client.query(`
    SELECT DISTINCT ano FROM custos_fixos_mensal ORDER BY ano DESC
  `);
  return result.rows.map((r) => r.ano);
}

async function garantirExercicio(client, ano) {
  await client.query(`
    INSERT INTO custos_fixos_mensal (ano, mes, template_id, nome, valor, eh_extra)
    SELECT $1, m.mes, t.id, t.nome, t.valor_padrao, false
    FROM generate_series(1, 12) AS m(mes)
    CROSS JOIN custos_fixos_template t
    WHERE t.ativo = true
      AND NOT EXISTS (
        SELECT 1 FROM custos_fixos_mensal cm
        WHERE cm.ano = $1 AND cm.mes = m.mes AND cm.template_id = t.id
      )
  `, [ano]);
}

async function propagarTemplateEmAnos(client, templateId, anos) {
  const template = await client.query(
    'SELECT * FROM custos_fixos_template WHERE id = $1 AND ativo = true',
    [templateId]
  );
  if (template.rowCount === 0) return;

  const item = template.rows[0];
  for (const ano of anos) {
    for (let mes = 1; mes <= 12; mes += 1) {
      await client.query(`
        INSERT INTO custos_fixos_mensal (ano, mes, template_id, nome, valor, eh_extra)
        SELECT $1, $2, $3, $4, $5, false
        WHERE NOT EXISTS (
          SELECT 1 FROM custos_fixos_mensal cm
          WHERE cm.ano = $1 AND cm.mes = $2 AND cm.template_id = $3
        )
      `, [ano, mes, item.id, item.nome, item.valor_padrao]);
    }
  }
}

async function obterAnosParaPropagacao(client) {
  const anos = await listarAnosComDados(client);
  const atual = new Date().getFullYear();
  if (!anos.includes(atual)) anos.push(atual);
  return [...new Set(anos)].sort((a, b) => a - b);
}

async function listCustosFixosTemplate() {
  assertAcesso();
  const db = getPool();
  const result = await db.query(`
    SELECT * FROM custos_fixos_template
    ORDER BY ordem, nome
  `);
  return result.rows.map(mapTemplateRow);
}

async function createCustoFixoTemplate(data) {
  assertAcesso();
  const db = getPool();
  const client = await db.connect();

  const nome = data.nome?.trim();
  const valorPadrao = round2(data.valor_padrao);
  const ordem = Number(data.ordem) || 0;

  if (!nome) throw new Error('Informe o nome do custo fixo.');
  if (valorPadrao < 0) throw new Error('O valor padrão não pode ser negativo.');

  try {
    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO custos_fixos_template (nome, valor_padrao, ordem, ativo)
      VALUES ($1, $2, $3, true)
      RETURNING *
    `, [nome, valorPadrao, ordem]);

    const anos = await obterAnosParaPropagacao(client);
    await propagarTemplateEmAnos(client, result.rows[0].id, anos);

    await client.query('COMMIT');
    return mapTemplateRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateCustoFixoTemplate(id, data) {
  assertAcesso();
  const db = getPool();
  const client = await db.connect();

  const existente = await db.query('SELECT * FROM custos_fixos_template WHERE id = $1', [id]);
  if (existente.rowCount === 0) throw new Error('Item do template não encontrado.');

  const nome = data.nome?.trim();
  const valorPadrao = round2(data.valor_padrao);
  const ordem = Number(data.ordem) ?? existente.rows[0].ordem;
  const ativo = data.ativo !== false;

  if (!nome) throw new Error('Informe o nome do custo fixo.');
  if (valorPadrao < 0) throw new Error('O valor padrão não pode ser negativo.');

  try {
    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE custos_fixos_template
      SET nome = $1, valor_padrao = $2, ordem = $3, ativo = $4, atualizado_em = NOW()
      WHERE id = $5
      RETURNING *
    `, [nome, valorPadrao, ordem, ativo, id]);

    await client.query(`
      UPDATE custos_fixos_mensal
      SET nome = $1, atualizado_em = NOW()
      WHERE template_id = $2 AND eh_extra = false
    `, [nome, id]);

    if (ativo) {
      const anos = await obterAnosParaPropagacao(client);
      await propagarTemplateEmAnos(client, id, anos);
    }

    await client.query('COMMIT');
    return mapTemplateRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteCustoFixoTemplate(id) {
  assertAcesso();
  const db = getPool();

  const existente = await db.query('SELECT id FROM custos_fixos_template WHERE id = $1', [id]);
  if (existente.rowCount === 0) throw new Error('Item do template não encontrado.');

  await db.query(`
    UPDATE custos_fixos_template
    SET ativo = false, atualizado_em = NOW()
    WHERE id = $1
  `, [id]);

  return { id, ativo: false };
}

async function getExercicioCustosFixos(anoFiltro) {
  assertAcesso();
  const ano = normalizarAno(anoFiltro);
  const db = getPool();
  const client = await db.connect();

  try {
    await garantirExercicio(client, ano);

    const lancamentos = await client.query(`
      SELECT *
      FROM custos_fixos_mensal
      WHERE ano = $1
      ORDER BY mes, eh_extra, nome
    `, [ano]);

    const template = await client.query(`
      SELECT * FROM custos_fixos_template
      WHERE ativo = true
      ORDER BY ordem, nome
    `);

    const meses = [];
    let totalAno = 0;

    for (let mes = 1; mes <= 12; mes += 1) {
      const itens = lancamentos.rows
        .filter((r) => r.mes === mes)
        .map(mapMensalRow);
      const totalMes = round2(itens.reduce((s, i) => s + i.valor, 0));
      totalAno = round2(totalAno + totalMes);

      meses.push({
        mes,
        mes_label: MESES_LABEL[mes],
        total: totalMes,
        itens,
      });
    }

    return {
      ano,
      meses,
      total_ano: totalAno,
      template: template.rows.map(mapTemplateRow),
    };
  } finally {
    client.release();
  }
}

async function getMesCustosFixos(anoFiltro, mesFiltro) {
  assertAcesso();
  const ano = normalizarAno(anoFiltro);
  const mes = normalizarMes(mesFiltro);
  const exercicio = await getExercicioCustosFixos(ano);
  const mesData = exercicio.meses.find((m) => m.mes === mes);
  return {
    ano,
    mes,
    mes_label: MESES_LABEL[mes],
    total: mesData?.total || 0,
    itens: mesData?.itens || [],
    template: exercicio.template,
  };
}

async function updateCustoFixoMensal(id, data) {
  assertAcesso();
  const db = getPool();

  const existente = await db.query('SELECT * FROM custos_fixos_mensal WHERE id = $1', [id]);
  if (existente.rowCount === 0) throw new Error('Lançamento não encontrado.');

  const valor = round2(data.valor);
  if (valor < 0) throw new Error('O valor não pode ser negativo.');

  const observacoes = data.observacoes?.trim() || null;
  let nome = existente.rows[0].nome;

  if (existente.rows[0].eh_extra && data.nome?.trim()) {
    nome = data.nome.trim();
  }

  const result = await db.query(`
    UPDATE custos_fixos_mensal
    SET nome = $1, valor = $2, observacoes = $3, atualizado_em = NOW()
    WHERE id = $4
    RETURNING *
  `, [nome, valor, observacoes, id]);

  return mapMensalRow(result.rows[0]);
}

async function createCustoFixoExtra(data) {
  assertAcesso();
  const db = getPool();

  const ano = normalizarAno(data.ano);
  const mes = normalizarMes(data.mes);
  const nome = data.nome?.trim();
  const valor = round2(data.valor);
  const observacoes = data.observacoes?.trim() || null;

  if (!nome) throw new Error('Informe o nome do custo extra.');
  if (valor < 0) throw new Error('O valor não pode ser negativo.');

  const result = await db.query(`
    INSERT INTO custos_fixos_mensal (ano, mes, template_id, nome, valor, eh_extra, observacoes)
    VALUES ($1, $2, NULL, $3, $4, true, $5)
    RETURNING *
  `, [ano, mes, nome, valor, observacoes]);

  return mapMensalRow(result.rows[0]);
}

async function deleteCustoFixoMensal(id) {
  assertAcesso();
  const db = getPool();

  const existente = await db.query('SELECT * FROM custos_fixos_mensal WHERE id = $1', [id]);
  if (existente.rowCount === 0) throw new Error('Lançamento não encontrado.');
  if (!existente.rows[0].eh_extra) {
    throw new Error('Itens do template não podem ser excluídos do mês. Ajuste o valor ou desative no template.');
  }

  await db.query('DELETE FROM custos_fixos_mensal WHERE id = $1', [id]);
  return { id };
}

async function aplicarPadroesMes(anoFiltro, mesFiltro) {
  assertAcesso();
  const ano = normalizarAno(anoFiltro);
  const mes = normalizarMes(mesFiltro);
  const db = getPool();
  const client = await db.connect();

  try {
    await garantirExercicio(client, ano);

    await client.query(`
      UPDATE custos_fixos_mensal cm
      SET valor = t.valor_padrao,
          nome = t.nome,
          atualizado_em = NOW()
      FROM custos_fixos_template t
      WHERE cm.template_id = t.id
        AND cm.ano = $1
        AND cm.mes = $2
        AND cm.eh_extra = false
        AND t.ativo = true
    `, [ano, mes]);

    return getMesCustosFixos(ano, mes);
  } finally {
    client.release();
  }
}

async function aplicarPadroesExercicio(anoFiltro) {
  assertAcesso();
  const ano = normalizarAno(anoFiltro);
  const db = getPool();
  const client = await db.connect();

  try {
    await garantirExercicio(client, ano);

    await client.query(`
      UPDATE custos_fixos_mensal cm
      SET valor = t.valor_padrao,
          nome = t.nome,
          atualizado_em = NOW()
      FROM custos_fixos_template t
      WHERE cm.template_id = t.id
        AND cm.ano = $1
        AND cm.eh_extra = false
        AND t.ativo = true
    `, [ano]);

    return getExercicioCustosFixos(ano);
  } finally {
    client.release();
  }
}

module.exports = {
  listCustosFixosTemplate,
  createCustoFixoTemplate,
  updateCustoFixoTemplate,
  deleteCustoFixoTemplate,
  getExercicioCustosFixos,
  getMesCustosFixos,
  updateCustoFixoMensal,
  createCustoFixoExtra,
  deleteCustoFixoMensal,
  aplicarPadroesMes,
  aplicarPadroesExercicio,
};
