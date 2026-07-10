const { getPool } = require('./database');
const { getSession } = require('./auth');
const {
  buildFiltroVendedorSql,
  assertAcessoVendedorRecurso,
  aplicarVendedorIdSessao,
} = require('./vendedorUsuario');
const { normalizarItemPlanejado } = require('./produtosPlanejados');

const FORMAS_PAGAMENTO_PADRAO = [
  { id: 'avista', nome: 'À vista', desconto_percentual: 10 },
  { id: 'cartao_1_6', nome: 'Cartão 1+6x', desconto_percentual: 5 },
  { id: 'cartao_6_10', nome: 'Cartão 6x a 10x', desconto_percentual: 0 },
];

const AMBIENTE_NOME_PADRAO = 'Geral';

async function gerarNumeroOrcamentoPlanejado() {
  const db = getPool();
  const result = await db.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^ORC-PL-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM orcamentos_planejados
    WHERE numero LIKE 'ORC-PL-%'
  `);
  return `ORC-PL-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

function flattenItens(ambientes) {
  return ambientes.flatMap((ambiente) => ambiente.itens || []);
}

function calcularTotais(ambientes) {
  const itens = flattenItens(ambientes);
  const subtotal = itens.reduce((sum, item) => {
    return sum + (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);
  }, 0);
  return { subtotal, total: subtotal };
}

function calcularDataValidade(dias, baseDate = new Date()) {
  const data = new Date(baseDate);
  data.setDate(data.getDate() + Number(dias));
  return data.toISOString().split('T')[0];
}

function normalizarFormasPagamento(formas) {
  if (!formas || !Array.isArray(formas) || formas.length === 0) {
    return FORMAS_PAGAMENTO_PADRAO;
  }
  return formas.map((f) => ({
    id: f.id,
    nome: f.nome,
    desconto_percentual: Number(f.desconto_percentual) || 0,
  }));
}

function normalizarItem(item) {
  return normalizarItemPlanejado(item);
}

async function marcarOrcamentosPlanejadosExpirados() {
  const db = getPool();
  const result = await db.query(`
    UPDATE orcamentos_planejados
    SET
      status = 'expirado',
      motivo_encerramento = 'expirado',
      encerrado_em = COALESCE(encerrado_em, NOW()),
      atualizado_em = NOW()
    WHERE status IN ('rascunho', 'enviado')
      AND motivo_encerramento IS NULL
      AND (
        (validade IS NOT NULL AND validade < CURRENT_DATE)
        OR (
          validade IS NULL
          AND (criado_em::date + COALESCE(validade_dias, 30)) < CURRENT_DATE
        )
      )
    RETURNING id
  `);
  return result.rowCount;
}

async function listOrcamentosPlanejados(busca = '') {
  await marcarOrcamentosPlanejadosExpirados();
  const db = getPool();
  const params = [`%${busca}%`];
  const filtro = buildFiltroVendedorSql(getSession(), 'o', params);
  const result = await db.query(`
    SELECT
      o.*,
      c.nome AS cliente_nome,
      c.email AS cliente_email,
      c.telefone AS cliente_telefone,
      v.nome AS vendedor_nome,
      (
        SELECT COUNT(*)::int
        FROM orcamento_planejado_itens oi
        WHERE oi.orcamento_planejado_id = o.id
      ) AS total_itens,
      vp.venda_planejado_id,
      vp.venda_planejado_numero
    FROM orcamentos_planejados o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN vendedores v ON v.id = o.vendedor_id
    LEFT JOIN LATERAL (
      SELECT ve.id AS venda_planejado_id, ve.numero AS venda_planejado_numero
      FROM vendas_planejados ve
      WHERE ve.orcamento_planejado_id = o.id AND ve.status != 'cancelada'
      ORDER BY ve.criado_em DESC
      LIMIT 1
    ) vp ON true
    WHERE ($1 = '' OR o.numero ILIKE $1 OR c.nome ILIKE $1)
    ${filtro.sql}
    ORDER BY o.atualizado_em DESC
  `, params);
  return result.rows;
}

async function moverOrcamentoPlanejadoKanban(id, data) {
  const db = getPool();
  const coluna = data.coluna;

  const atual = await db.query('SELECT * FROM orcamentos_planejados WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Orçamento planejado não encontrado.');
  assertAcessoVendedorRecurso(getSession(), atual.rows[0].vendedor_id, 'orçamento planejado');
  const orc = atual.rows[0];

  let novoStatus = orc.status;
  let motivoEncerramento = orc.motivo_encerramento;
  let encerradoEm = orc.encerrado_em;

  if (coluna === 'rascunho') {
    novoStatus = 'rascunho';
    motivoEncerramento = null;
    encerradoEm = null;
  } else if (coluna === 'enviado') {
    novoStatus = 'enviado';
    motivoEncerramento = null;
    encerradoEm = null;
  } else if (coluna === 'aprovado') {
    novoStatus = 'aprovado';
    motivoEncerramento = null;
    encerradoEm = null;
  } else if (coluna === 'encerrado' || coluna === 'rejeitado') {
    const motivo = data.motivo_encerramento || 'recusado';
    if (!['recusado', 'expirado'].includes(motivo)) {
      throw new Error('Motivo de encerramento inválido.');
    }
    novoStatus = motivo === 'expirado' ? 'expirado' : 'recusado';
    motivoEncerramento = motivo;
    encerradoEm = new Date();
  } else if (coluna === 'expirado') {
    novoStatus = 'expirado';
    motivoEncerramento = 'expirado';
    encerradoEm = new Date();
  } else {
    throw new Error('Coluna de kanban inválida.');
  }

  const result = await db.query(`
    UPDATE orcamentos_planejados SET
      status = $2,
      motivo_encerramento = $3,
      encerrado_em = $4,
      atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, novoStatus, motivoEncerramento, encerradoEm]);

  const row = result.rows[0];
  const lista = await listOrcamentosPlanejados('');
  const enriched = lista.find((o) => o.id === row.id);
  return enriched || row;
}

async function getOrcamentoPlanejado(id) {
  await marcarOrcamentosPlanejadosExpirados();
  const db = getPool();
  const orcamento = await db.query(`
    SELECT o.*, c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj,
           c.telefone AS cliente_telefone, c.email AS cliente_email,
           c.endereco AS cliente_endereco, c.cidade AS cliente_cidade,
           c.estado AS cliente_estado, c.cep AS cliente_cep,
           c.observacoes AS cliente_observacoes,
           v.nome AS vendedor_nome
    FROM orcamentos_planejados o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN vendedores v ON v.id = o.vendedor_id
    WHERE o.id = $1
  `, [id]);

  if (orcamento.rowCount === 0) return null;

  const row = orcamento.rows[0];
  assertAcessoVendedorRecurso(getSession(), row.vendedor_id, 'orçamento planejado');
  row.formas_pagamento = normalizarFormasPagamento(row.formas_pagamento);
  row.validade_dias = row.validade_dias || 30;
  row.prazo_entrega_dias = row.prazo_entrega_dias || 60;

  const ambientesResult = await db.query(`
    SELECT * FROM orcamento_planejado_ambientes
    WHERE orcamento_planejado_id = $1
    ORDER BY ordem, id
  `, [id]);

  const ambientes = [];
  for (const ambiente of ambientesResult.rows) {
    const itens = await db.query(`
      SELECT * FROM orcamento_planejado_itens
      WHERE ambiente_id = $1
      ORDER BY ordem, id
    `, [ambiente.id]);
    ambientes.push({ ...ambiente, itens: itens.rows });
  }

  return { ...row, ambientes };
}

async function salvarOrcamentoPlanejado(data, id = null) {
  const session = getSession();
  data = aplicarVendedorIdSessao(data, session);
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    if (id) {
      const atual = await client.query('SELECT vendedor_id FROM orcamentos_planejados WHERE id = $1', [id]);
      if (atual.rowCount === 0) throw new Error('Orçamento planejado não encontrado.');
      assertAcessoVendedorRecurso(session, atual.rows[0].vendedor_id, 'orçamento planejado');
    }

    if (!data.cliente_id) throw new Error('Selecione um cliente para o orçamento.');
    if (!data.ambientes || data.ambientes.length === 0) {
      throw new Error('Adicione pelo menos um ambiente ao orçamento.');
    }

    const ambientesValidos = data.ambientes
      .map((ambiente) => ({
        nome: (ambiente.nome || '').trim() || AMBIENTE_NOME_PADRAO,
        itens: (ambiente.itens || [])
          .map(normalizarItem)
          .filter((item) => item.descricao),
      }))
      .filter((ambiente) => ambiente.itens.length > 0);

    if (ambientesValidos.length === 0) {
      throw new Error('Adicione pelo menos um móvel com descrição em algum ambiente.');
    }

    const validadeDias = Number(data.validade_dias) || 30;
    const prazoEntregaOutro = data.prazo_entrega_outro
      ? String(data.prazo_entrega_outro).trim()
      : null;
    const prazoEntregaDias = prazoEntregaOutro
      ? null
      : (Number(data.prazo_entrega_dias) || 60);

    const formasPagamento = (data.formas_pagamento || [])
      .map((f) => ({
        id: f.id || `forma_${Date.now()}`,
        nome: (f.nome || '').trim(),
        desconto_percentual: Number(f.desconto_percentual) || 0,
      }))
      .filter((f) => f.nome);

    if (formasPagamento.length === 0) {
      throw new Error('Adicione pelo menos uma forma de pagamento com nome preenchido.');
    }

    const { subtotal } = calcularTotais(ambientesValidos);
    const total = subtotal;
    const descontoExtra = 0;
    let orcamento;

    if (id) {
      const atual = await client.query('SELECT criado_em FROM orcamentos_planejados WHERE id = $1', [id]);
      const dataValidade = calcularDataValidade(validadeDias, atual.rows[0]?.criado_em || new Date());
      const updated = await client.query(`
        UPDATE orcamentos_planejados SET
          cliente_id = $2, vendedor_id = $3, status = $4, validade = $5, validade_dias = $6,
          prazo_entrega_dias = $7, prazo_entrega_outro = $8,
          observacoes = $9, subtotal = $10, desconto = $11, formas_pagamento = $12,
          total = $13, atualizado_em = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        id, data.cliente_id, data.vendedor_id || null, data.status || 'rascunho', dataValidade, validadeDias,
        prazoEntregaDias, prazoEntregaOutro, data.observacoes || null, subtotal, descontoExtra,
        JSON.stringify(formasPagamento), total,
      ]);
      orcamento = updated.rows[0];
      await client.query('DELETE FROM orcamento_planejado_ambientes WHERE orcamento_planejado_id = $1', [id]);
    } else {
      const numero = await gerarNumeroOrcamentoPlanejado();
      const dataValidade = calcularDataValidade(validadeDias);
      const created = await client.query(`
        INSERT INTO orcamentos_planejados (
          numero, cliente_id, vendedor_id, status, validade, validade_dias,
          prazo_entrega_dias, prazo_entrega_outro, observacoes,
          subtotal, desconto, formas_pagamento, total
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        numero, data.cliente_id, data.vendedor_id || null, data.status || 'rascunho', dataValidade, validadeDias,
        prazoEntregaDias, prazoEntregaOutro, data.observacoes || null, subtotal, descontoExtra,
        JSON.stringify(formasPagamento), total,
      ]);
      orcamento = created.rows[0];
    }

    for (let a = 0; a < ambientesValidos.length; a++) {
      const ambiente = ambientesValidos[a];
      const ambienteRow = await client.query(`
        INSERT INTO orcamento_planejado_ambientes (orcamento_planejado_id, nome, ordem)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [orcamento.id, ambiente.nome, a]);

      const ambienteId = ambienteRow.rows[0].id;

      for (let i = 0; i < ambiente.itens.length; i++) {
        const item = ambiente.itens[i];
        const itemSubtotal = Number(item.quantidade) * Number(item.preco_unitario);
        await client.query(`
          INSERT INTO orcamento_planejado_itens (
            orcamento_planejado_id, ambiente_id, produto_planejado_id, descricao,
            largura, profundidade, altura, espessura_mdf, padrao_mdf,
            tipo_fundo, tipo_fundo_outro, tipo_porta, tipo_porta_outro,
            tipo_puxador, tipo_puxador_outro, cor_puxador,
            tipo_corredicas, tipo_corredicas_outro, canaleta_led, itens_extra,
            quantidade, preco_unitario, subtotal, ordem
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        `, [
          orcamento.id,
          ambienteId,
          item.produto_planejado_id || null,
          item.descricao,
          item.largura,
          item.profundidade,
          item.altura,
          item.espessura_mdf,
          item.padrao_mdf,
          item.tipo_fundo,
          item.tipo_fundo_outro,
          item.tipo_porta,
          item.tipo_porta_outro,
          item.tipo_puxador,
          item.tipo_puxador_outro,
          item.cor_puxador,
          item.tipo_corredicas,
          item.tipo_corredicas_outro,
          item.canaleta_led,
          item.itens_extra,
          item.quantidade,
          item.preco_unitario,
          itemSubtotal,
          i,
        ]);
      }
    }

    await client.query('COMMIT');
    return getOrcamentoPlanejado(orcamento.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteOrcamentoPlanejado(id) {
  const db = getPool();
  const atual = await db.query('SELECT vendedor_id FROM orcamentos_planejados WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Orçamento planejado não encontrado.');
  assertAcessoVendedorRecurso(getSession(), atual.rows[0].vendedor_id, 'orçamento planejado');
  await db.query('DELETE FROM orcamentos_planejados WHERE id = $1', [id]);
  return { success: true };
}

module.exports = {
  listOrcamentosPlanejados,
  getOrcamentoPlanejado,
  salvarOrcamentoPlanejado,
  moverOrcamentoPlanejadoKanban,
  marcarOrcamentosPlanejadosExpirados,
  deleteOrcamentoPlanejado,
  FORMAS_PAGAMENTO_PADRAO,
};
