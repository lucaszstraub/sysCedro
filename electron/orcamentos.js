const { getPool } = require('./database');
const { getSession } = require('./auth');
const {
  buildFiltroVendedorSql,
  assertAcessoVendedorRecurso,
  aplicarVendedorIdSessao,
} = require('./vendedorUsuario');
const formasPagamentoCadastro = require('./formasPagamento');

const FORMAS_PAGAMENTO_PADRAO = [
  { id: 'avista', nome: 'À vista', desconto_percentual: 10 },
  { id: 'cartao_1_6', nome: 'Cartão 1+6x', desconto_percentual: 5 },
  { id: 'cartao_6_10', nome: 'Cartão 6x a 10x', desconto_percentual: 0 },
];

async function gerarNumeroOrcamento() {
  const db = getPool();
  const result = await db.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^ORC-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM orcamentos
    WHERE numero LIKE 'ORC-%'
  `);
  return `ORC-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

function flattenItens(ambientes) {
  return ambientes.flatMap((ambiente) => ambiente.itens || []);
}

function calcularTotais(ambientes) {
  const itens = flattenItens(ambientes);
  const subtotal = itens.reduce((sum, item) => {
    const itemSubtotal = Number(item.quantidade) * Number(item.preco_unitario);
    return sum + itemSubtotal;
  }, 0);
  return { subtotal, total: subtotal };
}

function calcularDataValidade(dias, baseDate = new Date()) {
  const data = new Date(baseDate);
  data.setDate(data.getDate() + Number(dias));
  return data.toISOString().split('T')[0];
}

function isLegacyFormaPagamento(f) {
  return f && f.desconto_percentual != null && (f.valor == null || f.valor === '');
}

function normalizarFormasPagamento(formas) {
  if (!formas || !Array.isArray(formas) || formas.length === 0) {
    return [];
  }
  if (formas.some(isLegacyFormaPagamento)) {
    return formas.map((f) => ({
      id: f.id,
      nome: f.nome,
      desconto_percentual: Number(f.desconto_percentual) || 0,
    }));
  }
  return formas.map((p) => ({
    id: p.id || `pag_${Date.now()}`,
    forma_pagamento_id: p.forma_pagamento_id ? Number(p.forma_pagamento_id) : null,
    forma_nome: p.forma_nome || null,
    valor: Number(p.valor) || 0,
    parcelas: Math.max(Number(p.parcelas) || 1, 1),
    observacao: p.observacao || '',
  }));
}

async function enriquecerPagamentosOrcamento(pagamentos) {
  if (!pagamentos?.length || isLegacyFormaPagamento(pagamentos[0])) return pagamentos;
  const map = await formasPagamentoCadastro.getFormasPagamentoMap(
    pagamentos.map((p) => p.forma_pagamento_id)
  );
  return pagamentos.map((p) => ({
    ...p,
    forma_nome: p.forma_nome || (p.forma_pagamento_id ? map[p.forma_pagamento_id]?.nome : null),
  }));
}

async function listOrcamentos(busca = '') {
  await marcarOrcamentosExpirados();
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
        FROM orcamento_itens oi
        WHERE oi.orcamento_id = o.id
      ) AS total_itens,
      ven.venda_id,
      ven.venda_numero
    FROM orcamentos o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN vendedores v ON v.id = o.vendedor_id
    LEFT JOIN LATERAL (
      SELECT ve.id AS venda_id, ve.numero AS venda_numero
      FROM vendas ve
      WHERE ve.orcamento_id = o.id AND ve.status != 'cancelada'
      ORDER BY ve.criado_em DESC
      LIMIT 1
    ) ven ON true
    WHERE ($1 = '' OR o.numero ILIKE $1 OR c.nome ILIKE $1)
    ${filtro.sql}
    ORDER BY o.atualizado_em DESC
  `, params);
  return result.rows;
}

async function marcarOrcamentosExpirados() {
  const db = getPool();
  const result = await db.query(`
    UPDATE orcamentos
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

async function moverOrcamentoKanban(id, data) {
  const db = getPool();
  const coluna = data.coluna;
  const motivo = data.motivo_encerramento || null;

  const atual = await db.query('SELECT * FROM orcamentos WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Orçamento não encontrado.');
  assertAcessoVendedorRecurso(getSession(), atual.rows[0].vendedor_id, 'orçamento');
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
    const motivoFinal = motivo || 'recusado';
    if (!['recusado', 'expirado'].includes(motivoFinal)) {
      throw new Error('Motivo de encerramento inválido.');
    }
    novoStatus = motivoFinal === 'expirado' ? 'expirado' : 'recusado';
    motivoEncerramento = motivoFinal;
    encerradoEm = new Date();
  } else if (coluna === 'expirado') {
    novoStatus = 'expirado';
    motivoEncerramento = 'expirado';
    encerradoEm = new Date();
  } else {
    throw new Error('Coluna de kanban inválida.');
  }

  const result = await db.query(`
    UPDATE orcamentos SET
      status = $2,
      motivo_encerramento = $3,
      encerrado_em = $4,
      atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, novoStatus, motivoEncerramento, encerradoEm]);

  const row = result.rows[0];
  const lista = await listOrcamentos('');
  const enriched = lista.find((o) => o.id === row.id);
  return enriched || row;
}

async function listClientesMarketing(motivoEncerramento) {
  const db = getPool();
  if (!['recusado', 'expirado'].includes(motivoEncerramento)) {
    throw new Error('Motivo inválido. Use recusado ou expirado.');
  }
  const result = await db.query(`
    SELECT DISTINCT ON (c.id)
      c.id,
      c.nome,
      c.cpf_cnpj,
      c.telefone,
      c.email,
      c.cidade,
      c.estado,
      o.numero AS ultimo_orcamento_numero,
      o.total AS ultimo_orcamento_total,
      o.encerrado_em,
      o.motivo_encerramento
    FROM clientes c
    JOIN orcamentos o ON o.cliente_id = c.id
    WHERE o.motivo_encerramento = $1
    ORDER BY c.id, o.encerrado_em DESC NULLS LAST, o.atualizado_em DESC
  `, [motivoEncerramento]);
  return result.rows;
}

async function getOrcamento(id) {
  await marcarOrcamentosExpirados();
  const db = getPool();
  const orcamento = await db.query(`
    SELECT o.*, c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj,
           c.telefone AS cliente_telefone, c.email AS cliente_email,
           c.endereco AS cliente_endereco, c.cidade AS cliente_cidade,
           c.estado AS cliente_estado, c.cep AS cliente_cep,
           c.observacoes AS cliente_observacoes,
           v.nome AS vendedor_nome
    FROM orcamentos o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN vendedores v ON v.id = o.vendedor_id
    WHERE o.id = $1
  `, [id]);

  if (orcamento.rowCount === 0) return null;

  const row = orcamento.rows[0];
  assertAcessoVendedorRecurso(getSession(), row.vendedor_id, 'orçamento');
  row.formas_pagamento = await enriquecerPagamentosOrcamento(
    normalizarFormasPagamento(row.formas_pagamento)
  );
  row.validade_dias = row.validade_dias || 30;

  const ambientesResult = await db.query(`
    SELECT * FROM orcamento_ambientes
    WHERE orcamento_id = $1
    ORDER BY ordem, id
  `, [id]);

  const ambientes = [];
  for (const ambiente of ambientesResult.rows) {
    const itens = await db.query(`
      SELECT oi.*, p.sku AS produto_sku, p.foto_path AS produto_foto_path
      FROM orcamento_itens oi
      LEFT JOIN produtos p ON p.id = oi.produto_id
      WHERE oi.ambiente_id = $1
      ORDER BY oi.ordem, oi.id
    `, [ambiente.id]);
    ambientes.push({ ...ambiente, itens: itens.rows });
  }

  return { ...row, ambientes };
}

async function salvarOrcamento(data, id = null) {
  const session = getSession();
  data = aplicarVendedorIdSessao(data, session);
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    if (id) {
      const atual = await client.query('SELECT vendedor_id FROM orcamentos WHERE id = $1', [id]);
      if (atual.rowCount === 0) throw new Error('Orçamento não encontrado.');
      assertAcessoVendedorRecurso(session, atual.rows[0].vendedor_id, 'orçamento');
    }

    if (!data.cliente_id) throw new Error('Selecione um cliente para o orçamento.');
    if (!data.ambientes || data.ambientes.length === 0) {
      throw new Error('Adicione pelo menos um ambiente ao orçamento.');
    }

const AMBIENTE_NOME_PADRAO = 'Geral';

    const ambientesValidos = data.ambientes
      .map((ambiente) => ({
        nome: (ambiente.nome || '').trim() || AMBIENTE_NOME_PADRAO,
        itens: (ambiente.itens || [])
          .filter((item) => item.descricao && item.descricao.trim())
          .map((item) => ({
            produto_id: item.produto_id || null,
            descricao: item.descricao.trim(),
            quantidade: Number(item.quantidade) || 1,
            preco_unitario: Number(item.preco_unitario) || 0,
          })),
      }))
      .filter((ambiente) => ambiente.itens.length > 0);

    if (ambientesValidos.length === 0) {
      throw new Error('Adicione pelo menos um ambiente com itens ao orçamento.');
    }

    const validadeDias = Number(data.validade_dias) || 30;

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
    const descontoExtra = 0;
    const total = subtotal;
    let orcamento;

    if (id) {
      const atual = await client.query('SELECT criado_em FROM orcamentos WHERE id = $1', [id]);
      const dataValidade = calcularDataValidade(validadeDias, atual.rows[0]?.criado_em || new Date());
      const updated = await client.query(`
        UPDATE orcamentos SET
          cliente_id = $2, vendedor_id = $3, status = $4, validade = $5, validade_dias = $6,
          observacoes = $7, subtotal = $8, desconto = $9, formas_pagamento = $10,
          total = $11, atualizado_em = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        id, data.cliente_id, data.vendedor_id || null, data.status || 'rascunho', dataValidade, validadeDias,
        data.observacoes || null, subtotal, descontoExtra, JSON.stringify(formasPagamento), total,
      ]);
      orcamento = updated.rows[0];
      await client.query('DELETE FROM orcamento_ambientes WHERE orcamento_id = $1', [id]);
    } else {
      const numero = await gerarNumeroOrcamento();
      const dataValidade = calcularDataValidade(validadeDias);
      const created = await client.query(`
        INSERT INTO orcamentos (
          numero, cliente_id, vendedor_id, status, validade, validade_dias, observacoes,
          subtotal, desconto, formas_pagamento, total
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        numero, data.cliente_id, data.vendedor_id || null, data.status || 'rascunho', dataValidade, validadeDias,
        data.observacoes || null, subtotal, descontoExtra, JSON.stringify(formasPagamento), total,
      ]);
      orcamento = created.rows[0];
    }

    for (let a = 0; a < ambientesValidos.length; a++) {
      const ambiente = ambientesValidos[a];
      const ambienteRow = await client.query(`
        INSERT INTO orcamento_ambientes (orcamento_id, nome, ordem)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [orcamento.id, ambiente.nome, a]);

      const ambienteId = ambienteRow.rows[0].id;

      for (let i = 0; i < ambiente.itens.length; i++) {
        const item = ambiente.itens[i];
        const itemSubtotal = Number(item.quantidade) * Number(item.preco_unitario);
        await client.query(`
          INSERT INTO orcamento_itens (
            orcamento_id, ambiente_id, produto_id, descricao, quantidade, preco_unitario, subtotal, ordem
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          orcamento.id,
          ambienteId,
          item.produto_id || null,
          item.descricao,
          item.quantidade,
          item.preco_unitario,
          itemSubtotal,
          i,
        ]);
      }
    }

    await client.query('COMMIT');
    return getOrcamento(orcamento.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function aprovarOrcamentoVinculado(orcamentoId, client) {
  if (!orcamentoId) return;
  const db = client || getPool();
  await db.query(`
    UPDATE orcamentos SET
      status = 'aprovado',
      motivo_encerramento = NULL,
      encerrado_em = NULL,
      atualizado_em = NOW()
    WHERE id = $1
  `, [orcamentoId]);
}

async function updateOrcamentoStatus(id, status, motivoEncerramento = null) {
  const db = getPool();
  const atual = await db.query('SELECT vendedor_id FROM orcamentos WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Orçamento não encontrado.');
  assertAcessoVendedorRecurso(getSession(), atual.rows[0].vendedor_id, 'orçamento');
  const encerrado = ['recusado', 'expirado'].includes(status);
  const result = await db.query(`
    UPDATE orcamentos SET
      status = $2,
      motivo_encerramento = $3,
      encerrado_em = CASE WHEN $4 THEN COALESCE(encerrado_em, NOW()) ELSE NULL END,
      atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    status,
    encerrado ? (motivoEncerramento || status) : null,
    encerrado,
  ]);
  if (result.rowCount === 0) throw new Error('Orçamento não encontrado.');
  return result.rows[0];
}

async function deleteOrcamento(id) {
  const db = getPool();
  const atual = await db.query('SELECT vendedor_id FROM orcamentos WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Orçamento não encontrado.');
  assertAcessoVendedorRecurso(getSession(), atual.rows[0].vendedor_id, 'orçamento');
  await db.query('DELETE FROM orcamentos WHERE id = $1', [id]);
  return { success: true };
}

module.exports = {
  listOrcamentos,
  getOrcamento,
  salvarOrcamento,
  updateOrcamentoStatus,
  moverOrcamentoKanban,
  listClientesMarketing,
  marcarOrcamentosExpirados,
  aprovarOrcamentoVinculado,
  deleteOrcamento,
  FORMAS_PAGAMENTO_PADRAO,
};
