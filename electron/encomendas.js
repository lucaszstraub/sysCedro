const { getPool } = require('./database');
const { getSession } = require('./auth');
const entregas = require('./entregas');
const markupVendas = require('./markupVendas');
const faseImplantacao = require('./faseImplantacao');
const PRAZO_PADRAO = 30;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function calcularCustoRealRecebimento(valorNota, freteUnitario, ipiUnitario) {
  return round2(
    (Number(valorNota) || 0) + (Number(freteUnitario) || 0) + (Number(ipiUnitario) || 0)
  );
}

const CODIGO_LOCALIZACAO_NAO_ALOCADOS = 'NAO-ALOC';

async function obterLocalizacaoNaoAlocados(client) {
  const existing = await client.query(
    'SELECT id FROM localizacoes WHERE codigo = $1 AND ativo = true',
    [CODIGO_LOCALIZACAO_NAO_ALOCADOS]
  );
  if (existing.rowCount > 0) return existing.rows[0].id;

  const inserted = await client.query(`
    INSERT INTO localizacoes (codigo, nome, corredor, prateleira, capacidade, ativo)
    VALUES ($1, 'Não alocados', 'NAO', '00', 99999, true)
    RETURNING id
  `, [CODIGO_LOCALIZACAO_NAO_ALOCADOS]);
  return inserted.rows[0].id;
}

/** Valor computado para venda (custo interno). Coluna legada: custo_com_impostos. */
function resolverValorComputadoVenda(item) {
  const computado = Number(item?.valor_computado_venda);
  if (Number.isFinite(computado) && computado > 0) return round2(computado);
  const legado = Number(item?.custo_com_impostos);
  if (Number.isFinite(legado) && legado > 0) return round2(legado);
  return 0;
}

function resolverCustoEsperado(item) {
  return resolverValorComputadoVenda(item);
}

function calcularDataPrevisao(dias, dataBase = null) {
  const qtd = Number(dias);
  if (!qtd || qtd <= 0) return null;
  const base = dataBase ? new Date(`${dataBase}T12:00:00`) : new Date();
  base.setDate(base.getDate() + qtd);
  return base.toISOString().split('T')[0];
}

function normalizarNumeroNotaFiscal(valor) {
  const numero = String(valor || '').trim();
  if (!/^\d+$/.test(numero)) {
    throw new Error('Informe o número da nota fiscal (apenas dígitos).');
  }
  return numero;
}

function normalizarItemEncomenda(item, dataPedido, prazoPadrao) {
  const dias = Number(item.previsao_entrega_dias) || Number(prazoPadrao) || PRAZO_PADRAO;
  const custoNegociado = round2(item.custo_negociado);
  const valorComputado = resolverValorComputadoVenda(item) || custoNegociado;
  return {
    ...item,
    quantidade_pedida: Number(item.quantidade_pedida) || 1,
    custo_negociado: custoNegociado,
    custo_com_impostos: valorComputado,
    valor_computado_venda: valorComputado,
    previsao_entrega_dias: dias,
    previsao_entrega: item.previsao_entrega || calcularDataPrevisao(dias, dataPedido),
    destino_esperado: item.destino_esperado || 'estoque',
    observacoes: (item.observacoes || '').trim() || null,
  };
}

async function gerarNumeroEncomenda() {
  const db = getPool();
  const result = await db.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^ENC-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM encomendas_fornecedor
    WHERE numero LIKE 'ENC-%'
  `);
  return `ENC-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

async function getDisponibilidadeProduto(produtoId) {
  const db = getPool();
  const result = await db.query(`
    SELECT
      COALESCE((
        SELECT SUM(e.quantidade) FROM estoque e WHERE e.produto_id = $1
      ), 0)::int AS fisico,
      COALESCE((
        SELECT SUM(r.quantidade)
        FROM estoque_reservas r
        WHERE r.produto_id = $1 AND r.status = 'ativa'
      ), 0)::int AS reservado
  `, [produtoId]);

  const row = result.rows[0] || { fisico: 0, reservado: 0 };
  const fisico = Number(row.fisico) || 0;
  const reservado = Number(row.reservado) || 0;
  return {
    fisico,
    reservado,
    /** Pode ser negativo quando há compromisso (encomenda) sem estoque físico. */
    disponivel: fisico - reservado,
    disponivel_para_venda: Math.max(fisico - reservado, 0),
  };
}

async function listEncomendasFornecedor(busca = '') {
  const db = getPool();
  const result = await db.query(`
    SELECT ef.*, f.nome AS fornecedor_nome,
      COUNT(ei.id)::int AS total_itens,
      COALESCE(SUM(ei.quantidade_pedida), 0)::int AS total_unidades
    FROM encomendas_fornecedor ef
    JOIN fornecedores f ON f.id = ef.fornecedor_id
    LEFT JOIN encomenda_fornecedor_itens ei ON ei.encomenda_id = ef.id
    WHERE $1 = '' OR ef.numero ILIKE $1 OR f.nome ILIKE $1
    GROUP BY ef.id, f.nome
    ORDER BY ef.criado_em DESC
  `, [`%${busca}%`]);
  return result.rows;
}

async function getEncomendaFornecedor(id, dbOrClient = null) {
  const db = dbOrClient || getPool();
  const header = await db.query(`
    SELECT ef.*, f.nome AS fornecedor_nome, f.telefone AS fornecedor_telefone,
           f.email AS fornecedor_email
    FROM encomendas_fornecedor ef
    JOIN fornecedores f ON f.id = ef.fornecedor_id
    WHERE ef.id = $1
  `, [id]);
  if (header.rowCount === 0) return null;

  const itens = await db.query(`
    SELECT ei.*, p.sku AS produto_sku, p.nome AS produto_nome,
           p.preco_custo AS produto_preco_custo,
           p.descricao AS produto_descricao, p.material AS produto_material,
           p.cor AS produto_cor, p.largura_cm AS produto_largura_cm,
           p.altura_cm AS produto_altura_cm, p.profundidade_cm AS produto_profundidade_cm,
           p.peso_kg AS produto_peso_kg,
           vi.descricao AS item_venda_descricao,
           v.numero AS venda_numero, v.numero_pedido, c.nome AS cliente_nome
    FROM encomenda_fornecedor_itens ei
    JOIN produtos p ON p.id = ei.produto_id
    LEFT JOIN venda_itens vi ON vi.id = ei.venda_item_id
    LEFT JOIN vendas v ON v.id = ei.venda_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE ei.encomenda_id = $1
    ORDER BY ei.id
  `, [id]);

  return {
    ...header.rows[0],
    itens: itens.rows.map((item) => ({
      ...item,
      valor_computado_venda: resolverValorComputadoVenda(item),
    })),
  };
}

async function quantidadeJaEncomendadaVendaItem(client, vendaItemId, excludeItemId = null) {
  const result = await client.query(`
    SELECT COALESCE(SUM(quantidade_pedida), 0)::int AS qtd
    FROM encomenda_fornecedor_itens
    WHERE venda_item_id = $1
      AND status != 'cancelado'
      AND ($2::int IS NULL OR id != $2)
  `, [vendaItemId, excludeItemId]);
  return Number(result.rows[0]?.qtd) || 0;
}

async function validarQuantidadeVendaItem(client, vendaItemId, quantidadePedida, excludeItemId = null) {
  const vi = await client.query(
    'SELECT quantidade_encomenda, descricao FROM venda_itens WHERE id = $1',
    [vendaItemId]
  );
  if (vi.rowCount === 0) throw new Error('Item de venda não encontrado.');
  const demanda = Number(vi.rows[0].quantidade_encomenda) || 0;
  const jaEncomendado = await quantidadeJaEncomendadaVendaItem(client, vendaItemId, excludeItemId);
  const disponivel = demanda - jaEncomendado;
  const qty = Number(quantidadePedida) || 0;
  if (qty <= 0) throw new Error(`Informe a quantidade para "${vi.rows[0].descricao}".`);
  if (qty > disponivel) {
    throw new Error(
      `Item "${vi.rows[0].descricao}": quantidade (${qty}) excede o pendente de encomenda (${disponivel}).`
    );
  }
  return { demanda, jaEncomendado, disponivel };
}

const SQL_PENDENCIAS_ENCOMENDA = `
  WITH encomendado AS (
    SELECT venda_item_id, SUM(quantidade_pedida)::int AS qtd
    FROM encomenda_fornecedor_itens
    WHERE venda_item_id IS NOT NULL AND status != 'cancelado'
    GROUP BY venda_item_id
  )
  SELECT
    vi.id AS venda_item_id,
    vi.venda_id,
    v.numero AS venda_numero,
    v.numero_pedido,
    v.status AS venda_status,
    c.nome AS cliente_nome,
    vi.descricao AS item_descricao,
    vi.produto_id,
    p.sku AS produto_sku,
    p.nome AS produto_nome,
    p.fornecedor_id,
    f.nome AS fornecedor_nome,
    p.preco_custo,
    vi.quantidade_encomenda,
    COALESCE(e.qtd, 0)::int AS quantidade_ja_encomendada,
    (vi.quantidade_encomenda - COALESCE(e.qtd, 0))::int AS quantidade_pendente
  FROM venda_itens vi
  JOIN vendas v ON v.id = vi.venda_id
  JOIN clientes c ON c.id = v.cliente_id
  LEFT JOIN produtos p ON p.id = vi.produto_id
  LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
  LEFT JOIN encomendado e ON e.venda_item_id = vi.id
  WHERE v.status != 'cancelada'
    AND vi.quantidade_encomenda > 0
    AND (vi.quantidade_encomenda - COALESCE(e.qtd, 0)) > 0
`;

async function listPendenciasEncomenda(fornecedorId = null, busca = '', vendaId = null) {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    ${SQL_PENDENCIAS_ENCOMENDA}
    AND ($1::int IS NULL OR p.fornecedor_id = $1)
    AND ($2 = '' OR v.numero ILIKE $2 OR v.numero_pedido ILIKE $2 OR c.nome ILIKE $2
         OR vi.descricao ILIKE $2 OR p.nome ILIKE $2 OR p.sku ILIKE $2
         OR f.nome ILIKE $2)
    AND ($3::int IS NULL OR v.id = $3)
    ORDER BY f.nome NULLS LAST, v.numero_pedido NULLS LAST, v.numero, vi.id
  `, [fornecedorId || null, termo, vendaId || null]);
  return result.rows;
}

async function getResumoPendenciasEncomenda() {
  const db = getPool();
  const result = await db.query(`
    SELECT
      COUNT(*)::int AS total_linhas_pendentes,
      COALESCE(SUM(quantidade_pendente), 0)::int AS total_unidades_pendentes,
      COUNT(DISTINCT fornecedor_id)::int AS fornecedores_com_pendencia
    FROM (${SQL_PENDENCIAS_ENCOMENDA}) pend
  `);
  const row = result.rows[0] || {
    total_linhas_pendentes: 0,
    total_unidades_pendentes: 0,
    fornecedores_com_pendencia: 0,
  };
  return {
    ...row,
    todos_encomendados: Number(row.total_linhas_pendentes) === 0,
  };
}

async function deleteEncomendaFornecedor(id) {
  const db = getPool();
  const client = await db.connect();
  let snapshot = null;
  let numero = null;

  try {
    await client.query('BEGIN');

    const enc = await client.query('SELECT id, numero FROM encomendas_fornecedor WHERE id = $1', [id]);
    if (enc.rowCount === 0) throw new Error('Encomenda não encontrada.');
    numero = enc.rows[0].numero;

    const recebidos = await client.query(`
      SELECT 1 FROM encomenda_fornecedor_itens
      WHERE encomenda_id = $1 AND quantidade_recebida > 0
      LIMIT 1
    `, [id]);
    if (recebidos.rowCount > 0) {
      throw new Error('Não é possível excluir: há produtos já recebidos nesta encomenda.');
    }

    snapshot = await getEncomendaFornecedor(id, client);
    await client.query('DELETE FROM encomendas_fornecedor WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }

  if (snapshot) {
    const arquivo = require('./arquivo');
    await arquivo.registrarExclusao('encomenda_fornecedor', id, snapshot, getSession());
  }
  return { success: true, numero };
}

async function salvarEncomendaFornecedor(data, id = null) {
  const db = getPool();
  const client = await db.connect();
  let encomendaId = null;
  let anteriorSnapshot = null;

  try {
    await client.query('BEGIN');

    if (!data.fornecedor_id) throw new Error('Selecione um fornecedor.');

    const prazoPadrao = Number(data.previsao_entrega_dias) || PRAZO_PADRAO;
    const dataPedido = data.data_pedido || new Date().toISOString().split('T')[0];
    const previsaoEntrega = data.previsao_entrega || calcularDataPrevisao(prazoPadrao, dataPedido);

    const itensManuais = (data.itens || [])
      .filter((i) => !i.venda_item_id && i.produto_id && Number(i.quantidade_pedida) > 0)
      .map((i) => normalizarItemEncomenda(i, dataPedido, prazoPadrao));

    const itensVendaPayload = (data.itens_venda || [])
      .filter((i) => i.venda_item_id && i.produto_id && Number(i.quantidade_pedida) > 0);

    const itensVendaExistentes = itensVendaPayload.filter((i) => i.id);
    const itensVendaNovos = itensVendaPayload.filter((i) => !i.id);
    const itensVendaRemovidos = (data.itens_venda_removidos || []).map(Number).filter(Boolean);

    if (itensManuais.length === 0 && itensVendaExistentes.length === 0 && itensVendaNovos.length === 0) {
      throw new Error('Adicione pelo menos um produto à encomenda.');
    }

    for (const itemId of itensVendaRemovidos) {
      if (!id) continue;
      const atual = await client.query(`
        SELECT id, quantidade_recebida, venda_item_id
        FROM encomenda_fornecedor_itens
        WHERE id = $1 AND encomenda_id = $2
      `, [itemId, id]);
      if (atual.rowCount === 0) continue;
      if (Number(atual.rows[0].quantidade_recebida) > 0) {
        throw new Error('Não é possível remover itens de venda que já possuem recebimento.');
      }
      await client.query('DELETE FROM encomenda_fornecedor_itens WHERE id = $1', [itemId]);
    }

    for (const item of itensVendaNovos) {
      await validarQuantidadeVendaItem(client, item.venda_item_id, item.quantidade_pedida);
    }

    for (const item of itensVendaExistentes) {
      const atual = await client.query(
        'SELECT quantidade_recebida FROM encomenda_fornecedor_itens WHERE id = $1 AND encomenda_id = $2',
        [item.id, id]
      );
      if (atual.rowCount === 0) throw new Error('Item de encomenda não encontrado.');
      const recebida = Number(atual.rows[0].quantidade_recebida) || 0;
      if (Number(item.quantidade_pedida) < recebida) {
        throw new Error('A quantidade pedida não pode ser menor que a quantidade já recebida.');
      }
      await validarQuantidadeVendaItem(client, item.venda_item_id, item.quantidade_pedida, item.id);
    }

    const itensVendaExistentesNorm = itensVendaExistentes.map(
      (i) => normalizarItemEncomenda(i, dataPedido, prazoPadrao)
    );
    const itensVendaNovosNorm = itensVendaNovos.map(
      (i) => normalizarItemEncomenda({ ...i, destino_esperado: 'cliente' }, dataPedido, prazoPadrao)
    );

    let encomenda;
    if (id) {
      anteriorSnapshot = await getEncomendaFornecedor(id, client);

      const updated = await client.query(`
        UPDATE encomendas_fornecedor SET
          fornecedor_id = $2, status = $3, data_pedido = $4,
          previsao_entrega = $5, previsao_entrega_dias = $6,
          observacoes = $7, atualizado_em = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        id, data.fornecedor_id, data.status || 'rascunho',
        dataPedido, previsaoEntrega, prazoPadrao,
        data.observacoes || null,
      ]);
      if (updated.rowCount === 0) throw new Error('Encomenda não encontrada.');
      encomenda = updated.rows[0];

      await client.query(`
        DELETE FROM encomenda_fornecedor_itens
        WHERE encomenda_id = $1 AND venda_item_id IS NULL
      `, [id]);
    } else {
      const numero = await gerarNumeroEncomendaInTransaction(client);
      const created = await client.query(`
        INSERT INTO encomendas_fornecedor (
          numero, fornecedor_id, status, data_pedido, previsao_entrega, previsao_entrega_dias,
          observacoes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        numero, data.fornecedor_id, data.status || 'rascunho',
        dataPedido, previsaoEntrega, prazoPadrao,
        data.observacoes || null,
      ]);
      encomenda = created.rows[0];
    }

    for (const item of itensManuais) {
      await client.query(`
        INSERT INTO encomenda_fornecedor_itens (
          encomenda_id, produto_id, venda_id, venda_item_id,
          quantidade_pedida, custo_negociado, custo_com_impostos,
          previsao_entrega_dias, previsao_entrega,
          destino_esperado, observacoes, status
        )
        VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, $8, $9, 'pendente')
      `, [
        encomenda.id,
        item.produto_id,
        item.quantidade_pedida,
        item.custo_negociado,
        item.custo_com_impostos,
        item.previsao_entrega_dias,
        item.previsao_entrega,
        item.destino_esperado,
        item.observacoes,
      ]);
    }

    for (const item of itensVendaExistentesNorm) {
      await client.query(`
        UPDATE encomenda_fornecedor_itens SET
          quantidade_pedida = $2,
          custo_negociado = $3,
          custo_com_impostos = $4,
          previsao_entrega_dias = $5,
          previsao_entrega = $6,
          destino_esperado = $7,
          observacoes = $8
        WHERE id = $1 AND encomenda_id = $9
      `, [
        item.id,
        item.quantidade_pedida,
        item.custo_negociado,
        item.custo_com_impostos,
        item.previsao_entrega_dias,
        item.previsao_entrega,
        item.destino_esperado || 'cliente',
        item.observacoes,
        encomenda.id,
      ]);
    }

    for (const item of itensVendaNovosNorm) {
      await client.query(`
        INSERT INTO encomenda_fornecedor_itens (
          encomenda_id, produto_id, venda_id, venda_item_id,
          quantidade_pedida, custo_negociado, custo_com_impostos,
          previsao_entrega_dias, previsao_entrega,
          destino_esperado, observacoes, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendente')
      `, [
        encomenda.id,
        item.produto_id,
        item.venda_id,
        item.venda_item_id,
        item.quantidade_pedida,
        item.custo_negociado,
        item.custo_com_impostos,
        item.previsao_entrega_dias,
        item.previsao_entrega,
        item.destino_esperado || 'cliente',
        item.observacoes,
      ]);
    }

    const linkedVendaItens = await client.query(`
      SELECT DISTINCT venda_item_id
      FROM encomenda_fornecedor_itens
      WHERE encomenda_id = $1 AND venda_item_id IS NOT NULL
    `, [encomenda.id]);
    for (const row of linkedVendaItens.rows) {
      await markupVendas.recalcularCustosVendaItem(client, row.venda_item_id);
    }

    await client.query('COMMIT');
    encomendaId = encomenda.id;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }

  const salva = await getEncomendaFornecedor(encomendaId);
  if (id && anteriorSnapshot) {
    const arquivo = require('./arquivo');
    await arquivo.registrarAlteracao(
      'encomenda_fornecedor',
      id,
      anteriorSnapshot,
      salva,
      getSession()
    );
  }
  return salva;
}

async function updateEncomendaFornecedorStatus(id, status) {
  const db = getPool();
  const result = await db.query(`
    UPDATE encomendas_fornecedor SET status = $2, atualizado_em = NOW()
    WHERE id = $1 RETURNING *
  `, [id, status]);
  if (result.rowCount === 0) throw new Error('Encomenda não encontrada.');
  return result.rows[0];
}

async function processarConfirmacaoVenda(vendaId, client) {
  const itens = await client.query(`
    SELECT vi.*, p.fornecedor_id, p.preco_custo, p.nome AS produto_nome
    FROM venda_itens vi
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE vi.venda_id = $1
  `, [vendaId]);

  for (const item of itens.rows) {
    await confirmarItemEfetivo(client, vendaId, item);
  }
}

async function confirmarItemEfetivo(client, vendaId, item) {
  if ((item.status || 'efetivo') !== 'efetivo') return;

  const reservaExistente = await client.query(`
    SELECT 1 FROM estoque_reservas
    WHERE venda_item_id = $1 AND status = 'ativa'
    LIMIT 1
  `, [item.id]);
  if (reservaExistente.rowCount > 0) return;

  const qtdTotal = Number(item.quantidade) || 0;
  const qtdEntregue = Number(item.quantidade_entregue) || 0;
  const qtdEstoque = Number(item.quantidade_estoque) || 0;
  const qtdEncomenda = Number(item.quantidade_encomenda) || 0;
  const qtdPecaLoja = Number(item.quantidade_peca_loja) || 0;

  if (qtdPecaLoja > 0 && !await faseImplantacao.isFaseImplantacaoAtiva(client)) {
    throw new Error(
      `Item "${item.descricao}": peça loja só pode ser usada durante a fase de implantação.`
    );
  }

  if (qtdEstoque + qtdEncomenda + qtdPecaLoja !== qtdTotal) {
    throw new Error(
      `Item "${item.descricao}": estoque (${qtdEstoque}) + encomenda (${qtdEncomenda}) + peça loja (${qtdPecaLoja}) deve ser igual à quantidade (${qtdTotal}).`
    );
  }

  if (qtdPecaLoja > 0) {
    await processarPecaLojaImplantacao(client, item, qtdPecaLoja);
  }

  const qtdEstoqueReservar = Math.max(qtdEstoque - qtdEntregue, 0);
  const qtdEncomendaReservar = Math.max(qtdEncomenda, 0);
  const qtdReservar = qtdEstoqueReservar + qtdEncomendaReservar;

  if (qtdEstoqueReservar > 0) {
    if (!item.produto_id) {
      throw new Error(`Item "${item.descricao}" usa estoque mas não tem produto vinculado.`);
    }
    const disp = await getDisponibilidadeProduto(item.produto_id);
    if (disp.disponivel_para_venda < qtdEstoqueReservar) {
      throw new Error(
        `Estoque insuficiente para "${item.descricao}". Disponível: ${disp.disponivel_para_venda}, solicitado: ${qtdEstoqueReservar}.`
      );
    }
  }

  if (qtdEncomenda > 0) {
    if (!item.produto_id) {
      throw new Error(`Item "${item.descricao}" é encomenda mas não tem produto vinculado.`);
    }
    if (!item.fornecedor_id) {
      throw new Error(`Produto "${item.produto_nome || item.descricao}" não tem fornecedor cadastrado.`);
    }
  }

  if (qtdReservar > 0 && item.produto_id) {
    await client.query(`
      INSERT INTO estoque_reservas (venda_id, venda_item_id, produto_id, quantidade, status)
      VALUES ($1, $2, $3, $4, 'ativa')
    `, [vendaId, item.id, item.produto_id, qtdReservar]);
  }
}

async function gerarNumeroEncomendaInTransaction(client) {
  const result = await client.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^ENC-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM encomendas_fornecedor
    WHERE numero LIKE 'ENC-%'
  `);
  return `ENC-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

async function processarCancelamentoVenda(vendaId, client) {
  await client.query(`
    UPDATE estoque_reservas SET status = 'cancelada', atualizado_em = NOW()
    WHERE venda_id = $1 AND status = 'ativa'
  `, [vendaId]);

  await client.query(`
    UPDATE encomenda_fornecedor_itens SET status = 'cancelado'
    WHERE venda_id = $1 AND status IN ('pendente', 'parcial')
  `, [vendaId]);
}

async function processarEntregaVenda(vendaId, client) {
  const reservas = await client.query(`
    SELECT r.*, vi.descricao
    FROM estoque_reservas r
    JOIN venda_itens vi ON vi.id = r.venda_item_id
    WHERE r.venda_id = $1 AND r.status = 'ativa'
  `, [vendaId]);

  for (const reserva of reservas.rows) {
    const loc = await client.query(`
      SELECT localizacao_id, quantidade
      FROM estoque
      WHERE produto_id = $1 AND quantidade > 0
      ORDER BY quantidade DESC
      LIMIT 1
    `, [reserva.produto_id]);

    if (loc.rowCount === 0) {
      throw new Error(`Sem estoque físico para baixar reserva do item "${reserva.descricao}".`);
    }

    const localizacaoId = loc.rows[0].localizacao_id;
    const qty = reserva.quantidade;

    await reduzirEstoqueTx(client, reserva.produto_id, localizacaoId, qty);

    const mov = await client.query(`
      INSERT INTO movimentacoes (
        produto_id, localizacao_origem_id, tipo, quantidade, motivo, usuario,
        referencia_tipo, referencia_id
      )
      VALUES ($1, $2, 'saida', $3, $4, 'sistema', 'venda', $5)
      RETURNING id
    `, [
      reserva.produto_id,
      localizacaoId,
      qty,
      `Entrega venda #${vendaId}`,
      vendaId,
    ]);

    await client.query(`
      UPDATE estoque_reservas SET status = 'baixada', atualizado_em = NOW()
      WHERE id = $1
    `, [reserva.id]);
  }
}

async function reduzirEstoqueTx(client, produtoId, localizacaoId, quantidade) {
  const current = await client.query(
    'SELECT quantidade FROM estoque WHERE produto_id = $1 AND localizacao_id = $2',
    [produtoId, localizacaoId]
  );
  if (current.rowCount === 0 || current.rows[0].quantidade < quantidade) {
    throw new Error('Estoque insuficiente na localização selecionada.');
  }
  await client.query(`
    UPDATE estoque SET quantidade = quantidade - $3, atualizado_em = NOW()
    WHERE produto_id = $1 AND localizacao_id = $2
  `, [produtoId, localizacaoId, quantidade]);
}

async function upsertEstoqueTx(client, produtoId, localizacaoId, quantidade) {
  await client.query(`
    INSERT INTO estoque (produto_id, localizacao_id, quantidade)
    VALUES ($1, $2, $3)
    ON CONFLICT (produto_id, localizacao_id)
    DO UPDATE SET quantidade = estoque.quantidade + $3, atualizado_em = NOW()
  `, [produtoId, localizacaoId, quantidade]);
}

async function processarPecaLojaImplantacao(client, item, quantidade) {
  if (quantidade <= 0) return;

  const jaProcessado = await client.query(`
    SELECT 1 FROM movimentacoes
    WHERE referencia_tipo = 'peca_loja_implantacao' AND referencia_id = $1
    LIMIT 1
  `, [item.id]);
  if (jaProcessado.rowCount > 0) return;

  if (!item.produto_id) {
    throw new Error(`Item "${item.descricao}" (peça loja) precisa ter produto vinculado.`);
  }

  const naoAlocId = await obterLocalizacaoNaoAlocados(client);
  const motivo = `Peça loja — venda histórica (${item.descricao})`;

  await upsertEstoqueTx(client, item.produto_id, naoAlocId, quantidade);
  await client.query(`
    INSERT INTO movimentacoes (
      produto_id, localizacao_destino_id, tipo, quantidade, motivo, usuario,
      referencia_tipo, referencia_id
    )
    VALUES ($1, $2, 'entrada', $3, $4, 'sistema', 'peca_loja_implantacao', $5)
  `, [item.produto_id, naoAlocId, quantidade, motivo, item.id]);

  await reduzirEstoqueTx(client, item.produto_id, naoAlocId, quantidade);
  await client.query(`
    INSERT INTO movimentacoes (
      produto_id, localizacao_origem_id, tipo, quantidade, motivo, usuario,
      referencia_tipo, referencia_id
    )
    VALUES ($1, $2, 'saida', $3, $4, 'sistema', 'peca_loja_implantacao', $5)
  `, [item.produto_id, naoAlocId, quantidade, motivo, item.id]);
}

async function calcularStatusItemRecebimento(quantidadePedida, quantidadeRecebida) {
  const pedida = Number(quantidadePedida) || 0;
  const recebida = Number(quantidadeRecebida) || 0;
  if (recebida >= pedida) return 'recebido';
  if (recebida > 0) return 'parcial';
  return 'pendente';
}

async function atualizarStatusEncomendaRecebimento(client, encomendaId) {
  const encAtual = await client.query(
    'SELECT status FROM encomendas_fornecedor WHERE id = $1',
    [encomendaId]
  );
  if (encAtual.rows[0]?.status === 'cancelada') return;

  const pendentesEnc = await client.query(`
    SELECT COUNT(*)::int AS pendentes
    FROM encomenda_fornecedor_itens
    WHERE encomenda_id = $1 AND status IN ('pendente', 'parcial')
  `, [encomendaId]);

  const atual = encAtual.rows[0]?.status;
  const novoStatus = pendentesEnc.rows[0].pendentes === 0
    ? 'recebida'
    : (atual === 'rascunho' ? 'rascunho' : 'parcial');

  await client.query(`
    UPDATE encomendas_fornecedor SET status = $2, atualizado_em = NOW()
    WHERE id = $1
  `, [encomendaId, novoStatus]);
}

const SQL_ITENS_CONTROLE_RECEBIMENTO = `
  SELECT
    ei.*,
    ef.numero AS encomenda_numero,
    ef.previsao_entrega,
    p.sku AS produto_sku,
    p.nome AS produto_nome,
    f.nome AS fornecedor_nome,
    ef.fornecedor_id,
    v.numero AS venda_numero,
    v.numero_pedido,
    c.nome AS cliente_nome,
    (ei.quantidade_pedida - ei.quantidade_recebida)::int AS quantidade_pendente,
    CASE WHEN ei.status = 'recebido' THEN 'recebido' ELSE 'a_receber' END AS situacao,
    (
      SELECT MAX(r.criado_em)
      FROM recebimento_encomenda_itens r
      WHERE r.encomenda_item_id = ei.id AND NOT r.estornado
    ) AS data_recebimento,
    (
      SELECT r.id
      FROM recebimento_encomenda_itens r
      WHERE r.encomenda_item_id = ei.id AND NOT r.estornado
      ORDER BY r.criado_em DESC
      LIMIT 1
    ) AS ultimo_recebimento_id
  FROM encomenda_fornecedor_itens ei
  JOIN encomendas_fornecedor ef ON ef.id = ei.encomenda_id
  JOIN produtos p ON p.id = ei.produto_id
  JOIN fornecedores f ON f.id = ef.fornecedor_id
  LEFT JOIN vendas v ON v.id = ei.venda_id
  LEFT JOIN clientes c ON c.id = v.cliente_id
  WHERE ei.status != 'cancelado'
    AND ef.status NOT IN ('cancelada')
`;

async function listItensControleRecebimento(filtro = 'a_receber', busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  let filtroSql = '';
  if (filtro === 'a_receber') {
    filtroSql = "AND ei.status IN ('pendente', 'parcial')";
  } else if (filtro === 'recebido') {
    filtroSql = "AND ei.status = 'recebido'";
  }

  const result = await db.query(`
    ${SQL_ITENS_CONTROLE_RECEBIMENTO}
    ${filtroSql}
    AND ($1 = '' OR ef.numero ILIKE $1 OR p.nome ILIKE $1 OR p.sku ILIKE $1
         OR f.nome ILIKE $1 OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1)
    ORDER BY
      CASE WHEN ei.status = 'recebido' THEN 1 ELSE 0 END,
      ef.previsao_entrega NULLS LAST,
      ei.id
  `, [termo]);
  return result.rows.map((item) => ({
    ...item,
    valor_computado_venda: resolverValorComputadoVenda(item),
  }));
}

async function listHistoricoRecebimentos(busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT
      r.*,
      ei.quantidade_pedida,
      ei.produto_id,
      p.sku AS produto_sku,
      p.nome AS produto_nome,
      ef.numero AS encomenda_numero,
      f.nome AS fornecedor_nome,
      nf.numero AS nota_fiscal_numero_cadastrada,
      v.numero AS venda_numero,
      v.numero_pedido,
      c.nome AS cliente_nome,
      ei.custo_negociado,
      ei.custo_com_impostos,
      ei.observacoes AS item_observacoes,
      l.codigo AS localizacao_codigo,
      l.nome AS localizacao_nome
    FROM recebimento_encomenda_itens r
    JOIN encomenda_fornecedor_itens ei ON ei.id = r.encomenda_item_id
    JOIN encomendas_fornecedor ef ON ef.id = ei.encomenda_id
    JOIN produtos p ON p.id = ei.produto_id
    JOIN fornecedores f ON f.id = ef.fornecedor_id
    LEFT JOIN vendas v ON v.id = ei.venda_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN localizacoes l ON l.id = r.localizacao_id
    LEFT JOIN notas_fiscais nf ON nf.id = r.nota_fiscal_id
    WHERE $1 = '' OR ef.numero ILIKE $1 OR p.nome ILIKE $1 OR p.sku ILIKE $1
          OR f.nome ILIKE $1 OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1
    ORDER BY r.criado_em DESC
  `, [termo]);
  return result.rows;
}

async function estornarRecebimento(recebimentoId) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const recResult = await client.query(`
      SELECT r.*, ei.encomenda_id, ei.produto_id, ei.quantidade_pedida,
             ei.quantidade_recebida, ef.numero AS encomenda_numero
      FROM recebimento_encomenda_itens r
      JOIN encomenda_fornecedor_itens ei ON ei.id = r.encomenda_item_id
      JOIN encomendas_fornecedor ef ON ef.id = ei.encomenda_id
      WHERE r.id = $1
      FOR UPDATE OF r, ei
    `, [recebimentoId]);

    if (recResult.rowCount === 0) throw new Error('Registro de recebimento não encontrado.');
    const rec = recResult.rows[0];
    if (rec.estornado) throw new Error('Este recebimento já foi estornado.');

    const qty = Number(rec.quantidade);
    const novaRecebida = Number(rec.quantidade_recebida) - qty;
    if (novaRecebida < 0) {
      throw new Error('Não foi possível estornar: quantidade recebida ficaria negativa.');
    }

    if (rec.localizacao_id) {
      // Verifica saldo total do produto em todo o estoque (pode ter sido movido)
      const estoqueTotal = await client.query(`
        SELECT localizacao_id, quantidade FROM estoque
        WHERE produto_id = $1 AND quantidade > 0
        ORDER BY CASE WHEN localizacao_id = $2 THEN 0 ELSE 1 END, quantidade DESC
      `, [rec.produto_id, rec.localizacao_id]);

      const totalDisponivel = estoqueTotal.rows.reduce(
        (s, r) => s + Number(r.quantidade), 0
      );
      if (totalDisponivel < qty) {
        throw new Error(
          `Estoque insuficiente para estornar (${totalDisponivel} disponível, ${qty} necessário). O produto pode ter sido vendido ou consumido.`
        );
      }

      // Deduz da localização original se possível, senão de outras localizações
      let restante = qty;
      for (const row of estoqueTotal.rows) {
        if (restante <= 0) break;
        const deduzir = Math.min(restante, Number(row.quantidade));
        await client.query(`
          UPDATE estoque SET quantidade = quantidade - $3, atualizado_em = NOW()
          WHERE produto_id = $1 AND localizacao_id = $2
        `, [rec.produto_id, row.localizacao_id, deduzir]);

        await client.query(`
          INSERT INTO movimentacoes (
            produto_id, localizacao_origem_id, tipo, quantidade, motivo, usuario,
            referencia_tipo, referencia_id
          )
          VALUES ($1, $2, 'saida', $3, $4, 'sistema', 'encomenda_estorno', $5)
        `, [
          rec.produto_id,
          row.localizacao_id,
          deduzir,
          `Estorno recebimento encomenda ${rec.encomenda_numero}`,
          recebimentoId,
        ]);
        restante -= deduzir;
      }
    }

    await client.query(`
      UPDATE recebimento_encomenda_itens
      SET estornado = TRUE, estornado_em = NOW()
      WHERE id = $1
    `, [recebimentoId]);

    const novoStatus = await calcularStatusItemRecebimento(
      rec.quantidade_pedida,
      novaRecebida
    );

    await client.query(`
      UPDATE encomenda_fornecedor_itens
      SET quantidade_recebida = $2, status = $3
      WHERE id = $1
    `, [rec.encomenda_item_id, novaRecebida, novoStatus]);

    await atualizarStatusEncomendaRecebimento(client, rec.encomenda_id);

    await markupVendas.reverterMarkupAposEstorno(client, recebimentoId);

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function aumentarReservaVendaItem(client, vendaItemId, quantidade) {
  if (!vendaItemId || quantidade <= 0) return;

  const viResult = await client.query('SELECT * FROM venda_itens WHERE id = $1', [vendaItemId]);
  if (viResult.rowCount === 0) return;
  const vi = viResult.rows[0];
  if (!vi.produto_id) return;

  const qtdEsperada = Math.max(
    0,
    (Number(vi.quantidade_estoque) || 0)
      + (Number(vi.quantidade_encomenda) || 0)
      - (Number(vi.quantidade_entregue) || 0)
  );

  const reserva = await client.query(`
    SELECT id, quantidade FROM estoque_reservas
    WHERE venda_item_id = $1 AND status = 'ativa'
    LIMIT 1
  `, [vendaItemId]);

  if (reserva.rowCount > 0) {
    const atual = Number(reserva.rows[0].quantidade) || 0;
    if (atual >= qtdEsperada) return;
    await client.query(`
      UPDATE estoque_reservas
      SET quantidade = $2, atualizado_em = NOW()
      WHERE id = $1
    `, [reserva.rows[0].id, qtdEsperada]);
    return;
  }

  if (qtdEsperada <= 0) return;

  await client.query(`
    INSERT INTO estoque_reservas (venda_id, venda_item_id, produto_id, quantidade, status)
    VALUES ($1, $2, $3, $4, 'ativa')
  `, [vi.venda_id, vendaItemId, vi.produto_id, qtdEsperada]);
}

async function receberEncomendaItem(data) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const qty = Number(data.quantidade);
    if (!qty || qty <= 0) throw new Error('Informe a quantidade recebida.');

    const itemResult = await client.query(`
      SELECT ei.*, ef.fornecedor_id, ef.numero AS encomenda_numero
      FROM encomenda_fornecedor_itens ei
      JOIN encomendas_fornecedor ef ON ef.id = ei.encomenda_id
      WHERE ei.id = $1
    `, [data.encomenda_item_id]);

    if (itemResult.rowCount === 0) throw new Error('Item de encomenda não encontrado.');
    const item = itemResult.rows[0];

    const pendente = Number(item.quantidade_pedida) - Number(item.quantidade_recebida);
    if (qty > pendente) {
      throw new Error(`Quantidade recebida (${qty}) excede o pendente (${pendente}).`);
    }

    const destino = item.destino_esperado || 'estoque';
    const localizacaoNaoAlocadosId = await obterLocalizacaoNaoAlocados(client);
    let localizacaoId = localizacaoNaoAlocadosId;
    if (data.localizacao_id) {
      const locId = Number(data.localizacao_id);
      const loc = await client.query(
        'SELECT id, codigo, nome FROM localizacoes WHERE id = $1 AND ativo = true',
        [locId]
      );
      if (loc.rowCount === 0) throw new Error('Localização de alocação inválida.');
      localizacaoId = loc.rows[0].id;
    }
    const locInfo = await client.query(
      'SELECT codigo, nome FROM localizacoes WHERE id = $1',
      [localizacaoId]
    );
    const locCodigo = locInfo.rows[0]?.codigo || '—';
    const locNome = locInfo.rows[0]?.nome || '';

    let notaFiscalId = data.nota_fiscal_id ? Number(data.nota_fiscal_id) : null;
    let numeroNotaFiscal;

    if (notaFiscalId) {
      const nota = await require('./notasFiscais').assertNotaFiscalDoFornecedor(
        client,
        notaFiscalId,
        item.fornecedor_id
      );
      numeroNotaFiscal = nota.numero;
    } else {
      numeroNotaFiscal = normalizarNumeroNotaFiscal(data.numero_nota_fiscal);
    }

    const valorNotaUnitario = Number(data.valor_nota_unitario);
    if (Number.isNaN(valorNotaUnitario) || valorNotaUnitario < 0) {
      throw new Error('Informe o valor unitário da nota fiscal.');
    }

    const freteUnitario = Number(data.frete_unitario);
    if (Number.isNaN(freteUnitario) || freteUnitario < 0) {
      throw new Error('Informe o valor unitário de frete da nota fiscal.');
    }

    const ipiUnitario = Number(data.ipi_unitario);
    if (Number.isNaN(ipiUnitario) || ipiUnitario < 0) {
      throw new Error('Informe o valor unitário de IPI da nota fiscal.');
    }

    const custoReal = calcularCustoRealRecebimento(valorNotaUnitario, freteUnitario, ipiUnitario);

    let movimentacaoId = null;

    await upsertEstoqueTx(client, item.produto_id, localizacaoId, qty);
    const mov = await client.query(`
      INSERT INTO movimentacoes (
        produto_id, localizacao_destino_id, tipo, quantidade, motivo, usuario,
        referencia_tipo, referencia_id
      )
      VALUES ($1, $2, 'entrada', $3, $4, 'sistema', 'encomenda_recebimento', $5)
      RETURNING id
    `, [
      item.produto_id,
      localizacaoId,
      qty,
      `Recebimento encomenda ${item.encomenda_numero} → ${locCodigo}${locNome ? ` (${locNome})` : ''}`,
      data.encomenda_item_id,
    ]);
    movimentacaoId = mov.rows[0].id;

    const recebimento = await client.query(`
      INSERT INTO recebimento_encomenda_itens (
        encomenda_item_id, quantidade, custo_real, valor_nota_unitario,
        frete_unitario, ipi_unitario, destino,
        localizacao_id, venda_item_id, movimentacao_id, observacoes, numero_nota_fiscal,
        nota_fiscal_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      data.encomenda_item_id,
      qty,
      custoReal,
      valorNotaUnitario,
      freteUnitario,
      ipiUnitario,
      destino,
      localizacaoId,
      destino === 'cliente' ? (item.venda_item_id || data.venda_item_id || null) : null,
      movimentacaoId,
      data.observacoes || null,
      numeroNotaFiscal,
      notaFiscalId,
    ]);

    const novaRecebida = Number(item.quantidade_recebida) + qty;
    const novoStatus = await calcularStatusItemRecebimento(
      item.quantidade_pedida,
      novaRecebida
    );

    await client.query(`
      UPDATE encomenda_fornecedor_itens
      SET quantidade_recebida = $2, status = $3
      WHERE id = $1
    `, [item.id, novaRecebida, novoStatus]);

    await atualizarStatusEncomendaRecebimento(client, item.encomenda_id);

    const vendaItemIdReserva = item.venda_item_id || data.venda_item_id || null;
    if (vendaItemIdReserva) {
      await aumentarReservaVendaItem(client, vendaItemIdReserva, qty);
    }

    const vendaItemId = destino === 'cliente' ? vendaItemIdReserva : null;
    if (vendaItemId) {
      await markupVendas.processarMarkupAposRecebimento(client, {
        recebimentoId: recebimento.rows[0].id,
        vendaItemId,
        quantidade: qty,
        custoRealUnitario: custoReal,
      });
    }

    const custoEsperado = resolverCustoEsperado(item);
    const divergencia = round2(custoReal - custoEsperado);
    let produtoCustoAtualizado = false;
    if (Math.abs(divergencia) >= 0.01 && item.produto_id) {
      await client.query(
        'UPDATE produtos SET preco_custo = $2, atualizado_em = NOW() WHERE id = $1',
        [item.produto_id, custoReal]
      );
      produtoCustoAtualizado = true;
    }

    await client.query('COMMIT');

    if (vendaItemId) {
      const vendaRef = await db.query(
        'SELECT venda_id FROM venda_itens WHERE id = $1',
        [vendaItemId]
      );
      const vendaIdSync = vendaRef.rows[0]?.venda_id;
      if (vendaIdSync) {
        const { sincronizarComissoesVenda } = require('./comissaoVendas');
        await sincronizarComissoesVenda(vendaIdSync);
      }
    }

    const entregaIds = await db.query(`
      SELECT DISTINCT e.id
      FROM entregas e
      JOIN entrega_itens ei ON ei.entrega_id = e.id
      WHERE ei.venda_item_id = $1
    `, [vendaItemId || item.venda_item_id]);
    for (const row of entregaIds.rows) {
      await entregas.atualizarStatusEntrega(db, row.id);
    }

    return {
      ...recebimento.rows[0],
      custo_negociado: Number(item.custo_negociado),
      valor_nota_unitario: valorNotaUnitario,
      frete_unitario: freteUnitario,
      ipi_unitario: ipiUnitario,
      custo_com_impostos: custoEsperado,
      valor_computado_venda: custoEsperado,
      divergencia_custo: divergencia,
      divergencia_percentual: custoEsperado > 0
        ? ((divergencia / custoEsperado) * 100)
        : null,
      produto_custo_atualizado: produtoCustoAtualizado,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listItensPendentesRecebimento(busca = '') {
  const db = getPool();
  const result = await db.query(`
    SELECT ei.*, ef.numero AS encomenda_numero, ef.previsao_entrega,
           p.sku AS produto_sku, p.nome AS produto_nome,
           f.nome AS fornecedor_nome, ef.fornecedor_id,
           v.numero AS venda_numero, v.numero_pedido, c.nome AS cliente_nome,
           (ei.quantidade_pedida - ei.quantidade_recebida)::int AS quantidade_pendente
    FROM encomenda_fornecedor_itens ei
    JOIN encomendas_fornecedor ef ON ef.id = ei.encomenda_id
    JOIN produtos p ON p.id = ei.produto_id
    JOIN fornecedores f ON f.id = ef.fornecedor_id
    LEFT JOIN vendas v ON v.id = ei.venda_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE ei.status IN ('pendente', 'parcial')
      AND ef.status NOT IN ('cancelada')
      AND ($1 = '' OR ef.numero ILIKE $1 OR p.nome ILIKE $1
           OR f.nome ILIKE $1 OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1)
    ORDER BY ef.previsao_entrega NULLS LAST, ei.id
  `, [`%${busca}%`]);
  return result.rows.map((item) => ({
    ...item,
    valor_computado_venda: resolverValorComputadoVenda(item),
  }));
}

module.exports = {
  getDisponibilidadeProduto,
  listEncomendasFornecedor,
  getEncomendaFornecedor,
  salvarEncomendaFornecedor,
  deleteEncomendaFornecedor,
  updateEncomendaFornecedorStatus,
  listPendenciasEncomenda,
  getResumoPendenciasEncomenda,
  processarConfirmacaoVenda,
  confirmarItemEfetivo,
  processarCancelamentoVenda,
  processarEntregaVenda,
  receberEncomendaItem,
  listItensPendentesRecebimento,
  listItensControleRecebimento,
  listHistoricoRecebimentos,
  estornarRecebimento,
};
