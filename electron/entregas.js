const { getPool } = require('./database');
const { normalizarStatusItem } = require('./vendaItemStatus');

const TIPO_LIBERACAO = new Set(['parcial', 'completa']);
const TIPO_EXPEDICAO = new Set(['entrega', 'assistencia']);
const PERIODO_ENTREGA = new Set(['matutino', 'vespertino']);
const CONFIRMACAO_CLIENTE = new Set(['pendente', 'confirmada']);

function toDateIso(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function resolverPeriodoEntrega(periodo) {
  return PERIODO_ENTREGA.has(periodo) ? periodo : 'matutino';
}

function hojeIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isExpedicaoKanban(entrega) {
  return entrega.data_prevista != null
    || entrega.status === 'agendada'
    || entrega.tipo === 'assistencia';
}

async function isVendaFullyDelivered(client, vendaId) {
  const result = await client.query(`
    SELECT COUNT(*)::int AS pendentes
    FROM venda_itens
    WHERE venda_id = $1
      AND status IN ('efetivo', 'consignado')
      AND quantidade_entregue < quantidade
  `, [vendaId]);
  return (result.rows[0]?.pendentes || 0) === 0;
}

async function expeditionCoversAllPendente(client, entregaId, vendaId) {
  const pendenteVenda = await client.query(`
    SELECT COALESCE(SUM(GREATEST(quantidade - quantidade_entregue, 0)), 0)::int AS qtd
    FROM venda_itens
    WHERE venda_id = $1 AND status IN ('efetivo', 'consignado')
  `, [vendaId]);

  const planejado = await client.query(`
    SELECT COALESCE(SUM(GREATEST(quantidade - quantidade_entregue, 0)), 0)::int AS qtd
    FROM entrega_itens
    WHERE entrega_id = $1
  `, [entregaId]);

  const pendente = pendenteVenda.rows[0]?.qtd || 0;
  const plano = planejado.rows[0]?.qtd || 0;
  return pendente > 0 && plano >= pendente;
}

async function recalcularIndicesEntrega(client, vendaId) {
  const expeditions = await client.query(`
    SELECT id
    FROM entregas
    WHERE venda_id = $1
      AND status NOT IN ('cancelada', 'pendente', 'disponivel')
      AND (
        data_prevista IS NOT NULL
        OR status = 'agendada'
        OR tipo = 'assistencia'
      )
    ORDER BY COALESCE(data_prevista, criado_em::date), id
  `, [vendaId]);

  const k = expeditions.rowCount;
  if (k === 0) return;

  const fullyDelivered = await isVendaFullyDelivered(client, vendaId);
  let total = fullyDelivered ? k : k + 1;

  if (!fullyDelivered && k === 1) {
    const cobreTudo = await expeditionCoversAllPendente(client, expeditions.rows[0].id, vendaId);
    if (cobreTudo) total = 1;
  }

  for (let i = 0; i < k; i += 1) {
    await client.query(`
      UPDATE entregas
      SET indice_sequencia = $2, indice_total = $3, atualizado_em = NOW()
      WHERE id = $1
    `, [expeditions.rows[i].id, i + 1, total]);
  }
}

async function enriquecerEntregaKanban(db, row) {
  const { calcularValorAReceberVenda } = require('./formaPagamentoAReceber');
  const venda = await db.query(`
    SELECT v.pagamentos, v.criado_em AS venda_criado_em, v.vendedor_id, vd.nome AS vendedor_nome
    FROM vendas v
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE v.id = $1
  `, [row.venda_id]);
  const valorAReceber = await calcularValorAReceberVenda(db, venda.rows[0]?.pagamentos);

  const indiceLabel = row.indice_sequencia && row.indice_total
    ? `${row.indice_sequencia}/${row.indice_total}`
    : null;

  return {
    ...row,
    vendedor_nome: venda.rows[0]?.vendedor_nome || null,
    venda_criado_em: venda.rows[0]?.venda_criado_em || null,
    valor_a_receber: valorAReceber,
    tem_a_receber: valorAReceber > 0,
    indice_label: indiceLabel,
    kanban_coluna: row.status === 'agendada' ? 'agendada' : 'concluida',
  };
}

function volumesPorUnidadeItem(item) {
  return Math.max(1, Number(item.volumes_por_unidade) || 1);
}

function mapQuantidadesEntrega(itensPayload = []) {
  const mapa = {};
  for (const linha of itensPayload) {
    if (!linha?.entrega_item_id) continue;
    mapa[linha.entrega_item_id] = Number(linha.quantidade) || 0;
  }
  return mapa;
}

function calcularVolumesTotais(itens = [], quantidadesMap = null, consignados = []) {
  let total = 0;

  for (const item of itens) {
    const qtd = quantidadesMap != null
      ? (Number(quantidadesMap[item.id]) || 0)
      : (Number(item.pendente_entrega) > 0 ? Number(item.pendente_entrega) : 0);
    if (qtd <= 0) continue;
    total += qtd * volumesPorUnidadeItem(item);
  }

  for (const item of consignados) {
    const qtd = Number(item.quantidade) || 0;
    if (qtd <= 0) continue;
    total += qtd * volumesPorUnidadeItem(item);
  }

  return total;
}

async function obterAmbientePadraoVenda(client, vendaId) {
  const amb = await client.query(
    'SELECT id FROM venda_ambientes WHERE venda_id = $1 ORDER BY ordem, id LIMIT 1',
    [vendaId]
  );
  if (amb.rowCount > 0) return amb.rows[0].id;

  const ins = await client.query(`
    INSERT INTO venda_ambientes (venda_id, nome, ordem)
    VALUES ($1, 'Geral', 0)
    RETURNING id
  `, [vendaId]);
  return ins.rows[0].id;
}

async function obterEntregaMasterId(client, vendaId) {
  const result = await client.query(
    'SELECT id FROM entregas WHERE venda_id = $1 AND numero = 1 LIMIT 1',
    [vendaId]
  );
  return result.rows[0]?.id || null;
}

async function sincronizarEntregaMasterItens(client, vendaId, vendaItemIds = null) {
  const params = [vendaId];
  let filtroItem = '';
  if (vendaItemIds?.length) {
    params.push(vendaItemIds);
    filtroItem = 'AND vi.id = ANY($2::int[])';
  }

  await client.query(`
    UPDATE entrega_itens ei
    SET quantidade_entregue = vi.quantidade_entregue
    FROM venda_itens vi, entregas e
    WHERE ei.venda_item_id = vi.id
      AND ei.entrega_id = e.id
      AND vi.venda_id = $1
      AND e.venda_id = $1
      AND e.numero = 1
      ${filtroItem}
  `, params);
}

async function atualizarStatusEntregaMaster(client, vendaId) {
  const masterId = await obterEntregaMasterId(client, vendaId);
  if (masterId) await atualizarStatusEntrega(client, masterId);
}

async function listarItensConsignadosBatch(client, entregaIds) {
  if (!entregaIds.length) return new Map();

  const result = await client.query(`
    SELECT
      c.id,
      c.entrega_id,
      c.produto_id,
      c.venda_item_id,
      c.descricao,
      c.quantidade,
      c.volumes_por_unidade,
      c.observacoes,
      c.criado_em,
      c.atualizado_em,
      p.sku AS produto_sku,
      p.nome AS produto_nome
    FROM entrega_itens_consignados c
    LEFT JOIN produtos p ON p.id = c.produto_id
    WHERE c.entrega_id = ANY($1::int[])
    ORDER BY c.entrega_id, c.id
  `, [entregaIds]);

  const mapa = new Map();
  for (const row of result.rows) {
    if (!mapa.has(row.entrega_id)) mapa.set(row.entrega_id, []);
    mapa.get(row.entrega_id).push(row);
  }
  return mapa;
}

async function listarItensConsignados(client, entregaId) {
  const result = await client.query(`
    SELECT
      c.id,
      c.entrega_id,
      c.produto_id,
      c.venda_item_id,
      c.descricao,
      c.quantidade,
      c.volumes_por_unidade,
      c.observacoes,
      c.criado_em,
      c.atualizado_em,
      p.sku AS produto_sku,
      p.nome AS produto_nome
    FROM entrega_itens_consignados c
    LEFT JOIN produtos p ON p.id = c.produto_id
    WHERE c.entrega_id = $1
    ORDER BY c.id
  `, [entregaId]);
  return result.rows;
}

async function salvarItensConsignados(client, entrega, itens = [], options = {}) {
  const entregaId = typeof entrega === 'object' ? entrega.id : entrega;
  const vendaId = typeof entrega === 'object' ? entrega.venda_id : null;
  const marcarEntregue = options.marcarEntregue === true;

  if (!vendaId) {
    await client.query('DELETE FROM entrega_itens_consignados WHERE entrega_id = $1', [entregaId]);
    for (const item of itens) {
      const descricao = String(item.descricao || '').trim();
      const quantidade = Number(item.quantidade) || 0;
      if (!descricao || quantidade <= 0) continue;
      await client.query(`
        INSERT INTO entrega_itens_consignados (
          entrega_id, produto_id, descricao, quantidade, volumes_por_unidade, observacoes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        entregaId,
        item.produto_id ? Number(item.produto_id) : null,
        descricao,
        quantidade,
        volumesPorUnidadeItem(item),
        item.observacoes?.trim() || null,
      ]);
    }
    return;
  }

  const ambienteId = await obterAmbientePadraoVenda(client, vendaId);
  const masterEntregaId = await obterEntregaMasterId(client, vendaId);
  const idsPersistidos = [];
  const vendaItemIdsMaterializados = [];

  for (const item of itens) {
    const descricao = String(item.descricao || '').trim();
    const quantidade = Number(item.quantidade) || 0;
    if (!descricao || quantidade <= 0) continue;

    let vendaItemId = item.venda_item_id ? Number(item.venda_item_id) : null;

    if (item.id) {
      const existente = await client.query(
        'SELECT venda_item_id FROM entrega_itens_consignados WHERE id = $1 AND entrega_id = $2',
        [item.id, entregaId]
      );
      if (existente.rowCount > 0 && existente.rows[0].venda_item_id) {
        vendaItemId = existente.rows[0].venda_item_id;
      }
    }

    const qtdEntregue = marcarEntregue ? quantidade : 0;

    if (vendaItemId) {
      await client.query(`
        UPDATE venda_itens SET
          descricao = $2,
          quantidade = $3,
          produto_id = COALESCE($4, produto_id),
          quantidade_entregue = CASE WHEN $5 THEN $3 ELSE quantidade_entregue END,
          status = 'consignado'
        WHERE id = $1 AND venda_id = $6
      `, [
        vendaItemId,
        descricao.slice(0, 300),
        quantidade,
        item.produto_id ? Number(item.produto_id) : null,
        marcarEntregue,
        vendaId,
      ]);
    } else {
      const inserted = await client.query(`
        INSERT INTO venda_itens (
          venda_id, ambiente_id, produto_id, descricao, quantidade,
          quantidade_estoque, quantidade_encomenda, quantidade_entregue,
          preco_unitario_lista, preco_unitario, subtotal, ordem, status
        )
        VALUES ($1, $2, $3, $4, $5, 0, 0, $6, 0, 0, 0, 0, 'consignado')
        RETURNING id
      `, [
        vendaId,
        ambienteId,
        item.produto_id ? Number(item.produto_id) : null,
        descricao.slice(0, 300),
        quantidade,
        qtdEntregue,
      ]);
      vendaItemId = inserted.rows[0].id;
    }

    vendaItemIdsMaterializados.push(vendaItemId);

    if (masterEntregaId) {
      await client.query(`
        INSERT INTO entrega_itens (entrega_id, venda_item_id, quantidade, quantidade_entregue)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (entrega_id, venda_item_id) DO UPDATE SET
          quantidade = GREATEST(entrega_itens.quantidade, EXCLUDED.quantidade),
          quantidade_entregue = GREATEST(entrega_itens.quantidade_entregue, EXCLUDED.quantidade_entregue)
      `, [masterEntregaId, vendaItemId, quantidade, qtdEntregue]);
    }

    let consignadoId = item.id ? Number(item.id) : null;
    if (consignadoId) {
      const updated = await client.query(`
        UPDATE entrega_itens_consignados SET
          produto_id = $2,
          venda_item_id = $3,
          descricao = $4,
          quantidade = $5,
          volumes_por_unidade = $6,
          observacoes = $7,
          atualizado_em = NOW()
        WHERE id = $1 AND entrega_id = $8
        RETURNING id
      `, [
        consignadoId,
        item.produto_id ? Number(item.produto_id) : null,
        vendaItemId,
        descricao,
        quantidade,
        volumesPorUnidadeItem(item),
        item.observacoes?.trim() || null,
        entregaId,
      ]);
      if (updated.rowCount === 0) consignadoId = null;
    }

    if (!consignadoId) {
      const insertedConsignado = await client.query(`
        INSERT INTO entrega_itens_consignados (
          entrega_id, produto_id, venda_item_id, descricao, quantidade, volumes_por_unidade, observacoes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        entregaId,
        item.produto_id ? Number(item.produto_id) : null,
        vendaItemId,
        descricao,
        quantidade,
        volumesPorUnidadeItem(item),
        item.observacoes?.trim() || null,
      ]);
      consignadoId = insertedConsignado.rows[0].id;
    }

    idsPersistidos.push(consignadoId);
  }

  const removidos = await client.query(`
    SELECT id, venda_item_id
    FROM entrega_itens_consignados
    WHERE entrega_id = $1
      ${idsPersistidos.length ? 'AND id <> ALL($2::int[])' : ''}
  `, idsPersistidos.length ? [entregaId, idsPersistidos] : [entregaId]);

  for (const row of removidos.rows) {
    if (row.venda_item_id && !marcarEntregue) {
      await client.query(`
        DELETE FROM venda_itens
        WHERE id = $1
          AND venda_id = $2
          AND status = 'consignado'
          AND quantidade_entregue = 0
      `, [row.venda_item_id, vendaId]);
    }
  }

  await client.query(`
    DELETE FROM entrega_itens_consignados
    WHERE entrega_id = $1
      ${idsPersistidos.length ? 'AND id <> ALL($2::int[])' : ''}
  `, idsPersistidos.length ? [entregaId, idsPersistidos] : [entregaId]);

  if (vendaItemIdsMaterializados.length) {
    await sincronizarEntregaMasterItens(client, vendaId, vendaItemIdsMaterializados);
  }
}

async function obterReservaAtiva(client, vendaItemId) {
  const result = await client.query(`
    SELECT * FROM estoque_reservas
    WHERE venda_item_id = $1 AND status = 'ativa'
    LIMIT 1
  `, [vendaItemId]);
  return result.rows[0] || null;
}

async function obterQuantidadeRecebidaEncomenda(client, vendaItemId) {
  const result = await client.query(`
    SELECT COALESCE(SUM(quantidade_recebida), 0)::int AS qtd
    FROM encomenda_fornecedor_itens
    WHERE venda_item_id = $1 AND status != 'cancelado'
  `, [vendaItemId]);
  return Number(result.rows[0]?.qtd) || 0;
}

async function preloadDisponibilidadeMaps(client, vendaItemIds) {
  const ids = [...new Set((vendaItemIds || []).filter(Boolean))];
  if (!ids.length) {
    return { reservas: new Map(), recebidos: new Map() };
  }

  const [reservasResult, recebidosResult] = await Promise.all([
    client.query(`
      SELECT DISTINCT ON (venda_item_id) venda_item_id, quantidade
      FROM estoque_reservas
      WHERE venda_item_id = ANY($1::int[]) AND status = 'ativa'
      ORDER BY venda_item_id, id DESC
    `, [ids]),
    client.query(`
      SELECT venda_item_id, COALESCE(SUM(quantidade_recebida), 0)::int AS qtd
      FROM encomenda_fornecedor_itens
      WHERE venda_item_id = ANY($1::int[]) AND status != 'cancelado'
      GROUP BY venda_item_id
    `, [ids]),
  ]);

  return {
    reservas: new Map(reservasResult.rows.map((r) => [r.venda_item_id, r])),
    recebidos: new Map(recebidosResult.rows.map((r) => [r.venda_item_id, Number(r.qtd)])),
  };
}

function calcularDisponibilidadeItemSync(vendaItem, maps) {
  const total = Number(vendaItem.quantidade) || 0;
  const entregue = Number(vendaItem.quantidade_entregue) || 0;
  const pendente = Math.max(total - entregue, 0);
  const status = normalizarStatusItem(vendaItem.status || 'efetivo');

  if (status === 'consignado') {
    return {
      total,
      entregue,
      pendente,
      disponivel: pendente,
      disponivel_estoque: 0,
      disponivel_encomenda: 0,
      pronto: pendente > 0,
    };
  }

  const reserva = maps.reservas.get(vendaItem.id);
  if (reserva && pendente > 0) {
    const disponivelReserva = Math.max(0, Math.min(Number(reserva.quantidade), pendente));
    return {
      total,
      entregue,
      pendente,
      disponivel: disponivelReserva,
      disponivel_estoque: disponivelReserva,
      disponivel_encomenda: 0,
      pronto: disponivelReserva >= pendente && pendente > 0,
    };
  }

  const qtdEstoque = Number(vendaItem.quantidade_estoque) || 0;
  const qtdEncomenda = Number(vendaItem.quantidade_encomenda) || 0;

  let disponivelEstoque = 0;
  if (qtdEstoque > 0 && pendente > 0) {
    const jaEntregueEstoque = Math.min(entregue, qtdEstoque);
    disponivelEstoque = Math.max(0, qtdEstoque - jaEntregueEstoque);
  }

  let disponivelEncomenda = 0;
  if (qtdEncomenda > 0 && pendente > 0) {
    const recebido = maps.recebidos.get(vendaItem.id) || 0;
    const jaEntregueEncomenda = Math.max(0, entregue - qtdEstoque);
    disponivelEncomenda = Math.max(
      0,
      Math.min(recebido - jaEntregueEncomenda, qtdEncomenda - jaEntregueEncomenda, pendente - disponivelEstoque)
    );
  }

  const disponivel = Math.min(pendente, disponivelEstoque + disponivelEncomenda);

  return {
    total,
    entregue,
    pendente,
    disponivel,
    disponivel_estoque: disponivelEstoque,
    disponivel_encomenda: disponivelEncomenda,
    pronto: disponivel >= pendente && pendente > 0,
  };
}

async function calcularDisponibilidadeItem(client, vendaItem, maps = null) {
  const preload = maps || await preloadDisponibilidadeMaps(client, [vendaItem.id]);
  return calcularDisponibilidadeItemSync(vendaItem, preload);
}

async function montarItensEntrega(client, entregaId) {
  const entregaMeta = await client.query(
    'SELECT numero FROM entregas WHERE id = $1',
    [entregaId]
  );
  const entregaNumero = entregaMeta.rows[0]?.numero ?? 1;

  const result = await client.query(`
    SELECT
      ei.id,
      ei.entrega_id,
      ei.venda_item_id,
      ei.quantidade,
      ei.quantidade_entregue,
      vi.descricao,
      vi.produto_id,
      vi.quantidade AS quantidade_venda,
      vi.quantidade_estoque,
      vi.quantidade_encomenda,
      vi.quantidade_entregue AS quantidade_entregue_venda,
      vi.status AS item_status,
      p.sku AS produto_sku,
      COALESCE(p.volumes_por_unidade, 1) AS volumes_por_unidade
    FROM entrega_itens ei
    JOIN venda_itens vi ON vi.id = ei.venda_item_id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE ei.entrega_id = $1
    ORDER BY ei.id
  `, [entregaId]);

  const vendaItemIds = result.rows.map((row) => row.venda_item_id);
  const dispMaps = await preloadDisponibilidadeMaps(client, vendaItemIds);

  const itens = [];
  for (const row of result.rows) {
    const entregueVenda = Number(row.quantidade_entregue_venda) || 0;
    const entregueExpedicao = Number(row.quantidade_entregue) || 0;
    const isMaster = entregaNumero === 1;

    const disp = calcularDisponibilidadeItemSync({
      id: row.venda_item_id,
      quantidade: row.quantidade_venda,
      quantidade_estoque: row.quantidade_estoque,
      quantidade_encomenda: row.quantidade_encomenda,
      quantidade_entregue: entregueVenda,
      status: row.item_status,
    }, dispMaps);

    const pendenteEntrega = isMaster
      ? Math.max(0, Number(row.quantidade_venda) - entregueVenda)
      : Math.max(0, Number(row.quantidade) - entregueExpedicao);
    const quantidadeEntregueExibicao = isMaster ? entregueVenda : entregueExpedicao;

    itens.push({
      ...row,
      quantidade_entregue: quantidadeEntregueExibicao,
      pendente_entrega: pendenteEntrega,
      disponivel_agora: Math.min(disp.disponivel, pendenteEntrega),
      item_pronto: disp.disponivel >= pendenteEntrega && pendenteEntrega > 0,
    });
  }
  return itens;
}

async function sincronizarItensFaltantesEntrega(client, vendaId) {
  const entregas = await client.query(
    'SELECT id FROM entregas WHERE venda_id = $1 ORDER BY numero, id',
    [vendaId]
  );
  if (entregas.rowCount === 0) return;

  const entregaId = entregas.rows[0].id;
  const itensVenda = await client.query(`
    SELECT id, quantidade
    FROM venda_itens
    WHERE venda_id = $1 AND status IN ('efetivo', 'consignado')
    ORDER BY id
  `, [vendaId]);

  for (const item of itensVenda.rows) {
    const existente = await client.query(`
      SELECT id, quantidade, quantidade_entregue
      FROM entrega_itens
      WHERE entrega_id = $1 AND venda_item_id = $2
    `, [entregaId, item.id]);

    if (existente.rowCount === 0) {
      await client.query(`
        INSERT INTO entrega_itens (entrega_id, venda_item_id, quantidade)
        VALUES ($1, $2, $3)
      `, [entregaId, item.id, item.quantidade]);
      continue;
    }

    const ei = existente.rows[0];
    const qtdVenda = Number(item.quantidade) || 0;
    const qtdEntrega = Number(ei.quantidade) || 0;
    if (qtdVenda > qtdEntrega) {
      await client.query(
        'UPDATE entrega_itens SET quantidade = $2 WHERE id = $1',
        [ei.id, qtdVenda]
      );
    }
  }

  await client.query(`
    DELETE FROM entrega_itens ei
    USING venda_itens vi, entregas e
    WHERE ei.venda_item_id = vi.id
      AND ei.entrega_id = e.id
      AND e.venda_id = $1
      AND vi.status = 'cancelado'
      AND ei.quantidade_entregue = 0
  `, [vendaId]);
}

async function calcularResumoEntrega(client, entrega, options = {}) {
  if (!options.readOnly) {
    await sincronizarItensFaltantesEntrega(client, entrega.venda_id);
  }
  const itens = await montarItensEntrega(client, entrega.id);
  const itens_consignados = await listarItensConsignados(client, entrega.id);
  return montarResumoEntregaFromItens(itens, itens_consignados, entrega);
}

async function atualizarStatusEntrega(client, entregaId) {
  const entregaResult = await client.query('SELECT * FROM entregas WHERE id = $1', [entregaId]);
  if (entregaResult.rowCount === 0) return;
  const entrega = entregaResult.rows[0];
  const resumo = await calcularResumoEntrega(client, entrega);

  let status = 'pendente';
  if (resumo.situacao === 'entregue') status = 'entregue';
  else if (resumo.situacao === 'parcial') status = 'parcial';
  else if (resumo.situacao === 'disponivel') status = 'disponivel';

  await client.query(`
    UPDATE entregas SET status = $2, atualizado_em = NOW()
    WHERE id = $1
  `, [entregaId, status]);

  const pendentesVenda = await client.query(`
    SELECT COUNT(*)::int AS pendentes
    FROM entregas
    WHERE venda_id = $1 AND status NOT IN ('entregue', 'cancelada')
  `, [entrega.venda_id]);

  if (pendentesVenda.rows[0].pendentes === 0) {
    await client.query(`
      UPDATE vendas SET status = 'entregue', atualizado_em = NOW()
      WHERE id = $1
    `, [entrega.venda_id]);
  } else {
    await client.query(`
      UPDATE vendas SET status = 'confirmada', atualizado_em = NOW()
      WHERE id = $1 AND status = 'entregue'
    `, [entrega.venda_id]);
  }
}

async function criarEntregaInicial(client, vendaId, tipoLiberacao = 'parcial') {
  const tipo = TIPO_LIBERACAO.has(tipoLiberacao) ? tipoLiberacao : 'parcial';

  const venda = await client.query(`
    SELECT v.*, c.endereco, c.cidade, c.estado, c.cep
    FROM vendas v
    JOIN clientes c ON c.id = v.cliente_id
    WHERE v.id = $1
  `, [vendaId]);
  if (venda.rowCount === 0) throw new Error('Venda não encontrada.');
  const v = venda.rows[0];

  const itens = await client.query(`
    SELECT id, quantidade, status
    FROM venda_itens
    WHERE venda_id = $1
      AND status IN ('efetivo', 'consignado')
    ORDER BY id
  `, [vendaId]);
  if (itens.rowCount === 0) throw new Error('A venda não possui itens para entrega.');

  const entrega = await client.query(`
    INSERT INTO entregas (
      venda_id, numero, tipo_liberacao, status,
      endereco_entrega, cidade_entrega, estado_entrega, cep_entrega
    )
    VALUES ($1, 1, $2, 'pendente', $3, $4, $5, $6)
    RETURNING *
  `, [vendaId, tipo, v.endereco, v.cidade, v.estado, v.cep]);

  const entregaId = entrega.rows[0].id;
  for (const item of itens.rows) {
    await client.query(`
      INSERT INTO entrega_itens (entrega_id, venda_item_id, quantidade)
      VALUES ($1, $2, $3)
    `, [entregaId, item.id, item.quantidade]);
  }

  await atualizarStatusEntrega(client, entregaId);
  return entrega.rows[0];
}

async function sincronizarEntregasVenda(client, vendaId, tipoLiberacao = 'parcial') {
  const emAndamento = await client.query(`
    SELECT 1
    FROM entrega_itens ei
    JOIN entregas e ON e.id = ei.entrega_id
    WHERE e.venda_id = $1 AND ei.quantidade_entregue > 0
    LIMIT 1
  `, [vendaId]);

  if (emAndamento.rowCount > 0) {
    await sincronizarItensFaltantesEntrega(client, vendaId);
    await client.query(`
      UPDATE entregas SET tipo_liberacao = $2, atualizado_em = NOW()
      WHERE venda_id = $1
    `, [vendaId, TIPO_LIBERACAO.has(tipoLiberacao) ? tipoLiberacao : 'parcial']);
    const entregas = await client.query('SELECT id FROM entregas WHERE venda_id = $1', [vendaId]);
    for (const e of entregas.rows) {
      await atualizarStatusEntrega(client, e.id);
    }
    return;
  }

  await client.query('DELETE FROM entregas WHERE venda_id = $1', [vendaId]);
  await criarEntregaInicial(client, vendaId, tipoLiberacao);
}

async function reduzirEstoqueFisico(client, produtoId, quantidade, motivo, referenciaId) {
  let restante = quantidade;
  const locs = await client.query(`
    SELECT e.localizacao_id, e.quantidade, l.codigo
    FROM estoque e
    JOIN localizacoes l ON l.id = e.localizacao_id
    WHERE e.produto_id = $1 AND e.quantidade > 0 AND l.ativo = true
    ORDER BY CASE WHEN l.codigo = 'NAO-ALOC' THEN 1 ELSE 0 END, e.quantidade DESC
  `, [produtoId]);

  for (const loc of locs.rows) {
    if (restante <= 0) break;
    const baixa = Math.min(restante, Number(loc.quantidade));
    await client.query(`
      UPDATE estoque SET quantidade = quantidade - $3, atualizado_em = NOW()
      WHERE produto_id = $1 AND localizacao_id = $2
    `, [produtoId, loc.localizacao_id, baixa]);

    await client.query(`
      INSERT INTO movimentacoes (
        produto_id, localizacao_origem_id, tipo, quantidade, motivo, usuario,
        referencia_tipo, referencia_id
      )
      VALUES ($1, $2, 'saida', $3, $4, 'sistema', 'entrega', $5)
    `, [produtoId, loc.localizacao_id, baixa, motivo, referenciaId]);

    restante -= baixa;
  }

  if (restante > 0) {
    throw new Error('Estoque físico insuficiente para concluir a entrega.');
  }
}

async function reduzirReservaAtiva(client, vendaItemId, quantidade) {
  const reserva = await obterReservaAtiva(client, vendaItemId);
  if (!reserva) return false;

  const novaQtd = Number(reserva.quantidade) - quantidade;
  if (novaQtd <= 0) {
    await client.query(`
      UPDATE estoque_reservas SET status = 'baixada', atualizado_em = NOW()
      WHERE id = $1
    `, [reserva.id]);
  } else {
    await client.query(`
      UPDATE estoque_reservas SET quantidade = $2, atualizado_em = NOW()
      WHERE id = $1
    `, [reserva.id, novaQtd]);
  }
  return true;
}

async function validarBaixaItemEntrega(client, vendaItem, quantidade) {
  const qtdEstoque = Number(vendaItem.quantidade_estoque) || 0;
  const entregueVenda = Number(vendaItem.quantidade_entregue) || 0;
  const pendenteVenda = Math.max(0, Number(vendaItem.quantidade) - entregueVenda);

  if (quantidade > pendenteVenda) {
    throw new Error(`Quantidade inválida para "${vendaItem.descricao}".`);
  }

  const reserva = await obterReservaAtiva(client, vendaItem.id);
  if (reserva) {
    if (quantidade > Number(reserva.quantidade)) {
      throw new Error(
        `Estoque reservado insuficiente para "${vendaItem.descricao}" (${reserva.quantidade} disponível).`
      );
    }
    return;
  }

  const qtdEncomenda = Number(vendaItem.quantidade_encomenda) || 0;
  const jaEntregueEstoque = Math.min(entregueVenda, qtdEstoque);
  const estoquePendente = Math.max(0, qtdEstoque - jaEntregueEstoque);
  const fromStock = Math.min(quantidade, estoquePendente);
  const fromEncomenda = quantidade - fromStock;

  if (fromEncomenda > 0) {
    const recebido = await obterQuantidadeRecebidaEncomenda(client, vendaItem.id);
    const jaEntregueEncomenda = Math.max(0, entregueVenda - qtdEstoque);
    const encomendaDisponivel = Math.max(0, recebido - jaEntregueEncomenda);
    if (fromEncomenda > encomendaDisponivel) {
      throw new Error(`Quantidade indisponível para entrega do item "${vendaItem.descricao}".`);
    }
  }
}

async function baixarItemEntrega(client, entrega, entregaItem, vendaItem, quantidade) {
  if (quantidade <= 0) return;
  if (!vendaItem.produto_id) {
    throw new Error(`Item "${vendaItem.descricao}" não possui produto vinculado para baixa de estoque.`);
  }

  await validarBaixaItemEntrega(client, vendaItem, quantidade);

  await reduzirEstoqueFisico(
    client,
    vendaItem.produto_id,
    quantidade,
    `Entrega expedição ${entrega.numero}`,
    entrega.id
  );

  await reduzirReservaAtiva(client, vendaItem.id, quantidade);
}

async function obterResumoExpedicoes(client, vendaId) {
  const result = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'agendada')::int AS agendadas,
      COUNT(*) FILTER (WHERE status IN ('entregue', 'parcial'))::int AS concluidas,
      MIN(data_prevista) FILTER (WHERE status = 'agendada') AS proxima_data,
      (
        SELECT periodo_entrega
        FROM entregas e2
        WHERE e2.venda_id = $1
          AND e2.numero > 1
          AND e2.status = 'agendada'
        ORDER BY e2.data_prevista ASC NULLS LAST, e2.id ASC
        LIMIT 1
      ) AS proximo_periodo,
      COUNT(*) FILTER (
        WHERE status = 'agendada' AND confirmacao_cliente = 'pendente'
      )::int AS aguardando_confirmacao
    FROM entregas
    WHERE venda_id = $1 AND numero > 1
  `, [vendaId]);

  return result.rows[0] || {
    total: 0,
    agendadas: 0,
    concluidas: 0,
    proxima_data: null,
    proximo_periodo: null,
    aguardando_confirmacao: 0,
  };
}

async function obterResumoExpedicoesBatch(client, vendaIds) {
  if (!vendaIds.length) return {};

  const [resumoResult, periodoResult] = await Promise.all([
    client.query(`
      SELECT
        venda_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'agendada')::int AS agendadas,
        COUNT(*) FILTER (WHERE status IN ('entregue', 'parcial'))::int AS concluidas,
        MIN(data_prevista) FILTER (WHERE status = 'agendada') AS proxima_data,
        COUNT(*) FILTER (
          WHERE status = 'agendada' AND confirmacao_cliente = 'pendente'
        )::int AS aguardando_confirmacao
      FROM entregas
      WHERE venda_id = ANY($1::int[]) AND numero > 1
      GROUP BY venda_id
    `, [vendaIds]),
    client.query(`
      SELECT DISTINCT ON (venda_id)
        venda_id,
        periodo_entrega AS proximo_periodo
      FROM entregas
      WHERE venda_id = ANY($1::int[])
        AND numero > 1
        AND status = 'agendada'
      ORDER BY venda_id, data_prevista ASC NULLS LAST, id ASC
    `, [vendaIds]),
  ]);

  const vazio = {
    total: 0,
    agendadas: 0,
    concluidas: 0,
    proxima_data: null,
    proximo_periodo: null,
    aguardando_confirmacao: 0,
  };

  const mapa = {};
  for (const row of resumoResult.rows) {
    mapa[row.venda_id] = { ...vazio, ...row };
  }
  for (const row of periodoResult.rows) {
    if (!mapa[row.venda_id]) mapa[row.venda_id] = { ...vazio };
    mapa[row.venda_id].proximo_periodo = row.proximo_periodo;
  }
  return mapa;
}

function montarResumoEntregaFromItens(itens, itensConsignados, entrega) {
  const totalItens = itens.reduce((s, i) => s + Number(i.quantidade), 0);
  const totalEntregue = itens.reduce((s, i) => s + Number(i.quantidade_entregue), 0);
  const totalPendente = itens.reduce((s, i) => s + Number(i.pendente_entrega), 0);
  const totalDisponivel = itens.reduce((s, i) => s + Number(i.disponivel_agora), 0);
  const volumes_calculados = calcularVolumesTotais(itens, null, itensConsignados);
  const todosProntos = itens.every((i) => i.item_pronto || Number(i.pendente_entrega) === 0);
  const algumEntregue = totalEntregue > 0;
  const tudoEntregue = totalPendente === 0 && totalItens > 0;

  let situacao = 'indisponivel';
  if (tudoEntregue) {
    situacao = 'entregue';
  } else if (algumEntregue) {
    situacao = 'parcial';
  } else if (entrega.tipo_liberacao === 'completa' && todosProntos && totalPendente > 0) {
    situacao = 'disponivel';
  } else if (entrega.tipo_liberacao === 'parcial' && totalDisponivel > 0) {
    situacao = 'disponivel';
  }

  return {
    itens,
    itens_consignados: itensConsignados,
    total_itens: totalItens,
    total_entregue: totalEntregue,
    total_pendente: totalPendente,
    total_disponivel: totalDisponivel,
    volumes_calculados,
    todos_prontos: todosProntos,
    situacao,
  };
}

function montarItensEntregaFromRows(rows, entregaNumero, dispMaps) {
  const itens = [];
  for (const row of rows) {
    const entregueVenda = Number(row.quantidade_entregue_venda) || 0;
    const entregueExpedicao = Number(row.quantidade_entregue) || 0;
    const isMaster = entregaNumero === 1;

    const disp = calcularDisponibilidadeItemSync({
      id: row.venda_item_id,
      quantidade: row.quantidade_venda,
      quantidade_estoque: row.quantidade_estoque,
      quantidade_encomenda: row.quantidade_encomenda,
      quantidade_entregue: entregueVenda,
      status: row.item_status,
    }, dispMaps);

    const pendenteEntrega = isMaster
      ? Math.max(0, Number(row.quantidade_venda) - entregueVenda)
      : Math.max(0, Number(row.quantidade) - entregueExpedicao);
    const quantidadeEntregueExibicao = isMaster ? entregueVenda : entregueExpedicao;

    itens.push({
      ...row,
      quantidade_entregue: quantidadeEntregueExibicao,
      pendente_entrega: pendenteEntrega,
      disponivel_agora: Math.min(disp.disponivel, pendenteEntrega),
      item_pronto: disp.disponivel >= pendenteEntrega && pendenteEntrega > 0,
    });
  }
  return itens;
}

async function calcularResumosEntregaLista(client, entregasRows) {
  if (!entregasRows.length) return new Map();

  const entregaIds = entregasRows.map((r) => r.id);
  const itemsResult = await client.query(`
    SELECT
      ei.id,
      ei.entrega_id,
      ei.venda_item_id,
      ei.quantidade,
      ei.quantidade_entregue,
      vi.descricao,
      vi.produto_id,
      vi.quantidade AS quantidade_venda,
      vi.quantidade_estoque,
      vi.quantidade_encomenda,
      vi.quantidade_entregue AS quantidade_entregue_venda,
      vi.status AS item_status,
      p.sku AS produto_sku,
      COALESCE(p.volumes_por_unidade, 1) AS volumes_por_unidade,
      e.numero AS entrega_numero
    FROM entrega_itens ei
    JOIN venda_itens vi ON vi.id = ei.venda_item_id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    JOIN entregas e ON e.id = ei.entrega_id
    WHERE ei.entrega_id = ANY($1::int[])
    ORDER BY ei.entrega_id, ei.id
  `, [entregaIds]);

  const vendaItemIds = itemsResult.rows.map((r) => r.venda_item_id);
  const [dispMaps, consignadosMap] = await Promise.all([
    preloadDisponibilidadeMaps(client, vendaItemIds),
    listarItensConsignadosBatch(client, entregaIds),
  ]);

  const itensPorEntrega = new Map();
  for (const row of itemsResult.rows) {
    if (!itensPorEntrega.has(row.entrega_id)) itensPorEntrega.set(row.entrega_id, []);
    itensPorEntrega.get(row.entrega_id).push(row);
  }

  const resumos = new Map();
  for (const entrega of entregasRows) {
    const rows = itensPorEntrega.get(entrega.id) || [];
    const entregaNumero = rows[0]?.entrega_numero ?? entrega.numero ?? 1;
    const itens = montarItensEntregaFromRows(rows, entregaNumero, dispMaps);
    const itensConsignados = consignadosMap.get(entrega.id) || [];
    resumos.set(entrega.id, montarResumoEntregaFromItens(itens, itensConsignados, entrega));
  }
  return resumos;
}

async function sincronizarReservasEncomendaRecebida(client) {
  const items = await client.query(`
    SELECT
      vi.id,
      vi.venda_id,
      vi.produto_id,
      vi.quantidade_estoque,
      vi.quantidade_entregue,
      COALESCE(SUM(efi.quantidade_recebida), 0)::int AS recebido
    FROM venda_itens vi
    JOIN encomenda_fornecedor_itens efi
      ON efi.venda_item_id = vi.id AND efi.status != 'cancelado'
    WHERE vi.status = 'efetivo' AND vi.quantidade_encomenda > 0
    GROUP BY vi.id
    HAVING COALESCE(SUM(efi.quantidade_recebida), 0) > 0
  `);

  for (const row of items.rows) {
    const entregue = Number(row.quantidade_entregue) || 0;
    const qtdEstoque = Number(row.quantidade_estoque) || 0;
    const recebido = Number(row.recebido) || 0;
    const jaEntregueEstoque = Math.min(entregue, qtdEstoque);
    const jaEntregueEncomenda = Math.max(0, entregue - qtdEstoque);
    const reservaDesejada = Math.max(0, qtdEstoque - jaEntregueEstoque)
      + Math.max(0, recebido - jaEntregueEncomenda);
    if (reservaDesejada <= 0) continue;

    const reserva = await obterReservaAtiva(client, row.id);
    if (!reserva) {
      await client.query(`
        INSERT INTO estoque_reservas (venda_id, venda_item_id, produto_id, quantidade, status)
        VALUES ($1, $2, $3, $4, 'ativa')
      `, [row.venda_id, row.id, row.produto_id, reservaDesejada]);
    } else if (Number(reserva.quantidade) < reservaDesejada) {
      await client.query(`
        UPDATE estoque_reservas SET quantidade = $2, atualizado_em = NOW()
        WHERE id = $1
      `, [reserva.id, reservaDesejada]);
    }
  }
}

let backfillEntregasDone = false;

async function backfillEntregasExistentes() {
  if (backfillEntregasDone) return;
  backfillEntregasDone = true;
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await sincronizarReservasEncomendaRecebida(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao sincronizar reservas de encomenda:', err.message);
  } finally {
    client.release();
  }

  const vendasSemEntrega = await db.query(`
    SELECT v.id
    FROM vendas v
    WHERE v.status IN ('confirmada', 'entregue')
      AND NOT EXISTS (SELECT 1 FROM entregas e WHERE e.venda_id = v.id)
  `);

  for (const row of vendasSemEntrega.rows) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await criarEntregaInicial(client, row.id, 'parcial');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erro ao criar entrega retroativa:', err.message);
    } finally {
      client.release();
    }
  }
}

async function listEntregasAgendadas(busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT
      e.*,
      v.numero AS venda_numero,
      v.numero_pedido,
      v.observacoes AS venda_observacoes,
      v.pagamentos AS venda_pagamentos,
      v.criado_em AS venda_criado_em,
      c.nome AS cliente_nome,
      c.telefone AS cliente_telefone,
      vd.nome AS vendedor_nome
    FROM entregas e
    JOIN vendas v ON v.id = e.venda_id
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE COALESCE(v.desativada, false) = false
      AND e.status IN ('agendada', 'entregue', 'parcial')
      AND (
        e.data_prevista IS NOT NULL
        OR e.status = 'agendada'
        OR e.tipo = 'assistencia'
      )
      AND e.numero > 1
      AND ($1 = '' OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1
           OR c.nome ILIKE $1 OR CAST(e.numero AS TEXT) ILIKE $1)
    ORDER BY
      CASE WHEN e.status = 'agendada' THEN 0 ELSE 1 END,
      e.data_prevista ASC NULLS LAST,
      e.criado_em DESC
  `, [termo]);

  const { getIdsFormaAReceber, calcularMapaAReceberPorVenda } = require('./formaPagamentoAReceber');
  const [resumosMap, idsAReceber] = await Promise.all([
    calcularResumosEntregaLista(db, result.rows),
    getIdsFormaAReceber(db),
  ]);
  const vendaIds = [...new Set(result.rows.map((r) => r.venda_id))];
  const mapaAReceber = await calcularMapaAReceberPorVenda(db, vendaIds, idsAReceber);
  const idSet = new Set(idsAReceber.map(Number));

  return result.rows.map((row) => {
    const resumo = resumosMap.get(row.id) || montarResumoEntregaFromItens([], [], row);
    const valorAReceber = idSet.size
      ? (mapaAReceber[row.venda_id] || 0)
      : 0;
    const indiceLabel = row.indice_sequencia && row.indice_total
      ? `${row.indice_sequencia}/${row.indice_total}`
      : null;

    return {
      ...row,
      ...resumo,
      situacao: resumo.situacao,
      vendedor_nome: row.vendedor_nome || null,
      venda_criado_em: row.venda_criado_em || null,
      valor_a_receber: valorAReceber,
      tem_a_receber: valorAReceber > 0,
      indice_label: indiceLabel,
      kanban_coluna: row.status === 'agendada' ? 'agendada' : 'concluida',
    };
  });
}

async function agendarExpedicao(vendaId, data = {}) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const venda = await client.query(`
      SELECT v.*, c.endereco, c.cidade, c.estado, c.cep
      FROM vendas v
      JOIN clientes c ON c.id = v.cliente_id
      WHERE v.id = $1
    `, [vendaId]);
    if (venda.rowCount === 0) throw new Error('Venda não encontrada.');

    const dataPrevista = data.data_prevista || hojeIsoDate();
    const itensPayload = data.itens || [];
    const temConsignados = (data.itens_consignados || []).some((i) => Number(i.quantidade) > 0);
    if (itensPayload.length === 0 && !temConsignados && data.tipo !== 'assistencia') {
      throw new Error('Informe os itens para agendar a entrega.');
    }

    const master = await client.query(
      'SELECT * FROM entregas WHERE venda_id = $1 AND numero = 1 LIMIT 1',
      [vendaId]
    );
    if (master.rowCount === 0) {
      await criarEntregaInicial(client, vendaId, data.tipo_liberacao || 'parcial');
    }

    const masterRow = (await client.query(
      'SELECT * FROM entregas WHERE venda_id = $1 AND numero = 1 LIMIT 1',
      [vendaId]
    )).rows[0];

    const maxNum = await client.query(
      'SELECT COALESCE(MAX(numero), 0)::int AS max_num FROM entregas WHERE venda_id = $1',
      [vendaId]
    );
    const numero = (maxNum.rows[0]?.max_num || 0) + 1;
    const tipo = TIPO_EXPEDICAO.has(data.tipo) ? data.tipo : 'entrega';
    const tipoLiberacao = TIPO_LIBERACAO.has(data.tipo_liberacao)
      ? data.tipo_liberacao
      : masterRow.tipo_liberacao;

    const resumoMaster = await calcularResumoEntrega(client, masterRow);
    const mapItensMaster = new Map(resumoMaster.itens.map((i) => [i.id, i]));

    for (const linha of itensPayload) {
      const qtd = Number(linha.quantidade) || 0;
      if (qtd <= 0) continue;
      const item = mapItensMaster.get(linha.entrega_item_id);
      if (!item) throw new Error('Item de entrega inválido.');
      if (qtd > item.pendente_entrega) {
        throw new Error(`Quantidade inválida para "${item.descricao}".`);
      }
      if (tipo !== 'assistencia' && qtd > item.disponivel_agora) {
        throw new Error(`"${item.descricao}" ainda não está disponível (${item.disponivel_agora} disponível).`);
      }
    }

    const entregaInsert = await client.query(`
      INSERT INTO entregas (
        venda_id, numero, tipo_liberacao, status, tipo,
        endereco_entrega, cidade_entrega, estado_entrega, cep_entrega,
        data_prevista, periodo_entrega, confirmacao_cliente,
        observacoes, observacoes_kanban,
        flag_urgencia, flag_assistencia_tecnica, descricao_assistencia
      )
      VALUES ($1, $2, $3, 'agendada', $4, $5, $6, $7, $8, $9, $10, 'pendente', $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      vendaId,
      numero,
      tipoLiberacao,
      tipo,
      venda.rows[0].endereco,
      venda.rows[0].cidade,
      venda.rows[0].estado,
      venda.rows[0].cep,
      dataPrevista,
      resolverPeriodoEntrega(data.periodo_entrega),
      data.observacoes || null,
      data.observacoes_kanban || null,
      Boolean(data.flag_urgencia),
      tipo === 'assistencia' || Boolean(data.flag_assistencia_tecnica),
      data.descricao_assistencia?.trim() || null,
    ]);

    const entregaId = entregaInsert.rows[0].id;

    for (const linha of itensPayload) {
      const qtd = Number(linha.quantidade) || 0;
      if (qtd <= 0) continue;
      const itemMaster = mapItensMaster.get(linha.entrega_item_id);
      await client.query(`
        INSERT INTO entrega_itens (entrega_id, venda_item_id, quantidade, quantidade_entregue)
        VALUES ($1, $2, $3, 0)
      `, [entregaId, itemMaster.venda_item_id, qtd]);
    }

    if (data.itens_consignados) {
      await salvarItensConsignados(client, entregaInsert.rows[0], data.itens_consignados);
    }

    const resumoNovo = await calcularResumoEntrega(client, entregaInsert.rows[0]);
    const quantidadesMap = mapQuantidadesEntrega(itensPayload);
    const volumes = calcularVolumesTotais(resumoNovo.itens, quantidadesMap, resumoNovo.itens_consignados);
    await client.query(
      'UPDATE entregas SET quantidade_volumes = $2 WHERE id = $1',
      [entregaId, Math.max(1, volumes || 1)]
    );

    await recalcularIndicesEntrega(client, vendaId);
    await client.query('COMMIT');
    return getEntrega(entregaId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function criarAssistenciaEntrega(data = {}) {
  const vendaId = Number(data.venda_id);
  if (!vendaId) throw new Error('Selecione a venda para a assistência.');
  if (!String(data.descricao_assistencia || '').trim()) {
    throw new Error('Descreva a assistência técnica.');
  }

  return agendarExpedicao(vendaId, {
    ...data,
    tipo: 'assistencia',
    flag_assistencia_tecnica: true,
    itens: data.itens || [],
  });
}

async function atualizarEntregaKanban(id, data = {}) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const atual = await client.query('SELECT * FROM entregas WHERE id = $1', [id]);
    if (atual.rowCount === 0) throw new Error('Entrega não encontrada.');
    const entrega = atual.rows[0];
    if (!isExpedicaoKanban(entrega) && entrega.numero <= 1) {
      throw new Error('Somente expedições agendadas podem ser editadas no kanban.');
    }

    if (data.itens) {
      const resumo = await calcularResumoEntrega(client, entrega);
      const mapItens = new Map(resumo.itens.map((i) => [i.id, i]));
      for (const linha of data.itens) {
        const qtd = Number(linha.quantidade) || 0;
        const item = mapItens.get(linha.entrega_item_id);
        if (!item) continue;
        if (entrega.status === 'agendada' && qtd > item.pendente_entrega + Number(item.quantidade_entregue || 0)) {
          throw new Error(`Quantidade inválida para "${item.descricao}".`);
        }
        await client.query(
          'UPDATE entrega_itens SET quantidade = $2 WHERE id = $1',
          [linha.entrega_item_id, Math.max(qtd, item.quantidade_entregue || 0)]
        );
      }
    }

    if (data.itens_consignados) {
      await salvarItensConsignados(client, entrega, data.itens_consignados);
    }

    const mudouData = data.data_prevista != null
      && toDateIso(data.data_prevista) !== toDateIso(entrega.data_prevista);
    const mudouPeriodo = data.periodo_entrega != null
      && resolverPeriodoEntrega(data.periodo_entrega) !== entrega.periodo_entrega;
    const confirmacaoCliente = CONFIRMACAO_CLIENTE.has(data.confirmacao_cliente)
      ? data.confirmacao_cliente
      : (mudouData || mudouPeriodo ? 'pendente' : null);

    await client.query(`
      UPDATE entregas SET
        data_prevista = COALESCE($2, data_prevista),
        periodo_entrega = COALESCE($3, periodo_entrega),
        confirmacao_cliente = COALESCE($4, confirmacao_cliente),
        observacoes = COALESCE($5, observacoes),
        observacoes_kanban = COALESCE($6, observacoes_kanban),
        flag_urgencia = COALESCE($7, flag_urgencia),
        flag_assistencia_tecnica = COALESCE($8, flag_assistencia_tecnica),
        descricao_assistencia = COALESCE($9, descricao_assistencia),
        atualizado_em = NOW()
      WHERE id = $1
    `, [
      id,
      data.data_prevista || null,
      data.periodo_entrega != null ? resolverPeriodoEntrega(data.periodo_entrega) : null,
      confirmacaoCliente,
      data.observacoes != null ? data.observacoes : null,
      data.observacoes_kanban != null ? data.observacoes_kanban : null,
      data.flag_urgencia != null ? Boolean(data.flag_urgencia) : null,
      data.flag_assistencia_tecnica != null ? Boolean(data.flag_assistencia_tecnica) : null,
      data.descricao_assistencia != null ? data.descricao_assistencia : null,
    ]);

    await recalcularIndicesEntrega(client, entrega.venda_id);
    await client.query('COMMIT');
    return getEntrega(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function confirmarAgendamentoCliente(id) {
  const db = getPool();
  const result = await db.query(`
    UPDATE entregas SET
      confirmacao_cliente = 'confirmada',
      atualizado_em = NOW()
    WHERE id = $1
      AND status = 'agendada'
      AND numero > 1
    RETURNING id
  `, [id]);
  if (result.rowCount === 0) {
    throw new Error('Entrega agendada não encontrada ou já concluída.');
  }
  return getEntrega(id);
}

async function listEntregas(filtro = 'todos', busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT
      e.*,
      v.numero AS venda_numero,
      v.numero_pedido,
      v.observacoes AS venda_observacoes,
      c.nome AS cliente_nome,
      c.telefone AS cliente_telefone
    FROM entregas e
    JOIN vendas v ON v.id = e.venda_id
    JOIN clientes c ON c.id = v.cliente_id
    WHERE COALESCE(v.desativada, false) = false
      AND e.numero = 1
      AND ($1 = '' OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1
           OR c.nome ILIKE $1 OR CAST(e.numero AS TEXT) ILIKE $1)
    ORDER BY e.criado_em DESC
  `, [termo]);

  const [resumosMap, expedicoesMap] = await Promise.all([
    calcularResumosEntregaLista(db, result.rows),
    obterResumoExpedicoesBatch(db, [...new Set(result.rows.map((r) => r.venda_id))]),
  ]);

  const lista = [];
  for (const row of result.rows) {
    const resumo = resumosMap.get(row.id) || montarResumoEntregaFromItens([], [], row);
    if (filtro !== 'todos' && resumo.situacao !== filtro) continue;
    lista.push({
      ...row,
      ...resumo,
      situacao: resumo.situacao,
      expedicoes: expedicoesMap[row.venda_id] || {
        total: 0,
        agendadas: 0,
        concluidas: 0,
        proxima_data: null,
        proximo_periodo: null,
        aguardando_confirmacao: 0,
      },
    });
  }
  return lista;
}

async function getEntrega(id) {
  const db = getPool();
  const result = await db.query(`
    SELECT
      e.*,
      v.numero AS venda_numero,
      v.numero_pedido,
      v.observacoes AS venda_observacoes,
      v.total AS venda_total,
      c.nome AS cliente_nome,
      c.cpf_cnpj AS cliente_cpf_cnpj,
      c.telefone AS cliente_telefone,
      c.email AS cliente_email,
      c.endereco AS cliente_endereco,
      c.cidade AS cliente_cidade,
      c.estado AS cliente_estado,
      c.cep AS cliente_cep
    FROM entregas e
    JOIN vendas v ON v.id = e.venda_id
    JOIN clientes c ON c.id = v.cliente_id
    WHERE e.id = $1
  `, [id]);
  if (result.rowCount === 0) return null;

  const entrega = result.rows[0];
  const resumo = await calcularResumoEntrega(db, entrega);
  const detalhe = { ...entrega, ...resumo };
  if (isExpedicaoKanban(entrega) || entrega.numero > 1) {
    return enriquecerEntregaKanban(db, detalhe);
  }
  return detalhe;
}

async function atualizarEntrega(id, data) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const entregaAtual = await client.query('SELECT * FROM entregas WHERE id = $1', [id]);
    if (entregaAtual.rowCount === 0) throw new Error('Entrega não encontrada.');

    if (data.itens_consignados) {
      await salvarItensConsignados(client, entregaAtual.rows[0], data.itens_consignados);
    }

    let quantidadeVolumes = data.quantidade_volumes != null
      ? Number(data.quantidade_volumes)
      : null;

    if (data.itens != null || data.itens_consignados != null) {
      const resumo = await calcularResumoEntrega(client, entregaAtual.rows[0]);
      const quantidadesMap = data.itens != null ? mapQuantidadesEntrega(data.itens) : null;
      const volumes = calcularVolumesTotais(resumo.itens, quantidadesMap, resumo.itens_consignados);
      quantidadeVolumes = Math.max(1, volumes || 1);
    }

    const result = await client.query(`
      UPDATE entregas SET
        quantidade_volumes = COALESCE($2, quantidade_volumes),
        observacoes = COALESCE($3, observacoes),
        data_prevista = $4,
        endereco_entrega = COALESCE($5, endereco_entrega),
        cidade_entrega = COALESCE($6, cidade_entrega),
        estado_entrega = COALESCE($7, estado_entrega),
        cep_entrega = COALESCE($8, cep_entrega),
        observacoes_kanban = COALESCE($9, observacoes_kanban),
        flag_urgencia = COALESCE($10, flag_urgencia),
        flag_assistencia_tecnica = COALESCE($11, flag_assistencia_tecnica),
        atualizado_em = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      id,
      quantidadeVolumes,
      data.observacoes != null ? data.observacoes : null,
      data.data_prevista || null,
      data.endereco_entrega || null,
      data.cidade_entrega || null,
      data.estado_entrega || null,
      data.cep_entrega || null,
      data.observacoes_kanban != null ? data.observacoes_kanban : null,
      data.flag_urgencia != null ? Boolean(data.flag_urgencia) : null,
      data.flag_assistencia_tecnica != null ? Boolean(data.flag_assistencia_tecnica) : null,
    ]);

    if (result.rowCount === 0) throw new Error('Entrega não encontrada.');
    await client.query('COMMIT');
    return getEntrega(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function registrarEntrega(id, data) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const entregaResult = await client.query('SELECT * FROM entregas WHERE id = $1 FOR UPDATE', [id]);
    if (entregaResult.rowCount === 0) throw new Error('Entrega não encontrada.');
    const entrega = entregaResult.rows[0];
    if (entrega.status === 'entregue') throw new Error('Esta entrega já foi concluída.');
    if (entrega.status === 'cancelada') throw new Error('Esta entrega está cancelada.');
    if (!['agendada', 'disponivel', 'parcial', 'pendente'].includes(entrega.status)) {
      throw new Error('Esta entrega não pode ser registrada no momento.');
    }

    const isAssistencia = entrega.tipo === 'assistencia';
    const resumo = await calcularResumoEntrega(client, entrega);
    const itensPayload = data.itens || [];
    const temConsignados = (data.itens_consignados || []).some((i) => Number(i.quantidade) > 0);

    if (itensPayload.length === 0 && !temConsignados && !isAssistencia) {
      throw new Error('Informe os itens a entregar ou produtos consignados.');
    }

    const mapItens = new Map(resumo.itens.map((i) => [i.id, i]));
    let totalEntregar = 0;
    const vendaItemIdsAtualizados = [];

    for (const linha of itensPayload) {
      const qtd = Number(linha.quantidade) || 0;
      if (qtd <= 0) continue;
      const item = mapItens.get(linha.entrega_item_id);
      if (!item) throw new Error('Item de entrega inválido.');
      if (qtd > item.pendente_entrega) {
        throw new Error(`Quantidade inválida para "${item.descricao}".`);
      }
      if (qtd > item.disponivel_agora) {
        throw new Error(`"${item.descricao}" ainda não está disponível para entrega (${item.disponivel_agora} disponível).`);
      }
      totalEntregar += qtd;
    }

    if (totalEntregar <= 0 && !temConsignados && !isAssistencia) {
      throw new Error('Informe ao menos uma quantidade para entregar ou um produto consignado.');
    }

    if (data.itens_consignados) {
      await salvarItensConsignados(client, entrega, data.itens_consignados, { marcarEntregue: true });
    }

    const resumoAtualizado = await calcularResumoEntrega(client, entrega);
    const quantidadesMap = mapQuantidadesEntrega(itensPayload);
    const volumesCalculados = Math.max(
      1,
      calcularVolumesTotais(resumoAtualizado.itens, quantidadesMap, resumoAtualizado.itens_consignados) || 1
    );

    await client.query(
      'UPDATE entregas SET quantidade_volumes = $2 WHERE id = $1',
      [id, volumesCalculados]
    );
    if (data.observacoes != null) {
      await client.query('UPDATE entregas SET observacoes = $2 WHERE id = $1', [id, data.observacoes]);
    }

    if (totalEntregar <= 0 && !temConsignados) {
      if (isAssistencia) {
        await client.query(`
          UPDATE entregas
          SET data_realizada = NOW(), status = 'entregue', atualizado_em = NOW()
          WHERE id = $1
        `, [id]);
        await recalcularIndicesEntrega(client, entrega.venda_id);
        await client.query('COMMIT');
        return getEntrega(id);
      }
      await client.query(`
        UPDATE entregas
        SET atualizado_em = NOW()
        WHERE id = $1
      `, [id]);
      await client.query('COMMIT');
      return getEntrega(id);
    }

    if (totalEntregar <= 0 && temConsignados) {
      await client.query(`
        UPDATE entregas
        SET data_realizada = NOW(), atualizado_em = NOW()
        WHERE id = $1
      `, [id]);
      await atualizarStatusEntrega(client, id);
      await sincronizarEntregaMasterItens(client, entrega.venda_id);
      await atualizarStatusEntregaMaster(client, entrega.venda_id);
      await recalcularIndicesEntrega(client, entrega.venda_id);
      await client.query('COMMIT');
      return getEntrega(id);
    }

    if (entrega.tipo_liberacao === 'completa') {
      const podeEntregarTudo = resumo.itens.every(
        (i) => Number(i.pendente_entrega) === 0 || i.disponivel_agora >= Number(i.pendente_entrega)
      );
      if (!podeEntregarTudo) {
        throw new Error('Entrega completa: aguarde todos os produtos ficarem disponíveis.');
      }
      const entregaTotal = resumo.itens.reduce((s, i) => s + Number(i.pendente_entrega), 0);
      if (totalEntregar !== entregaTotal) {
        throw new Error('Entrega completa: informe a quantidade total pendente de todos os itens.');
      }
    }

    for (const linha of itensPayload) {
      const qtd = Number(linha.quantidade) || 0;
      if (qtd <= 0) continue;

      const entregaItem = await client.query('SELECT * FROM entrega_itens WHERE id = $1 FOR UPDATE', [linha.entrega_item_id]);
      const ei = entregaItem.rows[0];

      const vendaItemResult = await client.query('SELECT * FROM venda_itens WHERE id = $1 FOR UPDATE', [ei.venda_item_id]);
      const vendaItem = vendaItemResult.rows[0];

      if (normalizarStatusItem(vendaItem.status) !== 'consignado') {
        await baixarItemEntrega(client, entrega, ei, vendaItem, qtd);
      }

      await client.query(`
        UPDATE entrega_itens
        SET quantidade_entregue = quantidade_entregue + $2
        WHERE id = $1
      `, [ei.id, qtd]);

      await client.query(`
        UPDATE venda_itens
        SET quantidade_entregue = quantidade_entregue + $2
        WHERE id = $1
      `, [vendaItem.id, qtd]);

      vendaItemIdsAtualizados.push(vendaItem.id);
    }

    await sincronizarEntregaMasterItens(client, entrega.venda_id, vendaItemIdsAtualizados);

    await client.query(`
      UPDATE entregas
      SET data_realizada = NOW(), atualizado_em = NOW()
      WHERE id = $1
    `, [id]);

    await atualizarStatusEntrega(client, id);
    await atualizarStatusEntregaMaster(client, entrega.venda_id);
    await recalcularIndicesEntrega(client, entrega.venda_id);
    await client.query('COMMIT');
    return getEntrega(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getDadosTicketEntrega(id) {
  const entrega = await getEntrega(id);
  if (!entrega) throw new Error('Entrega não encontrada.');

  const db = getPool();
  const venda = await db.query('SELECT pagamentos FROM vendas WHERE id = $1', [entrega.venda_id]);
  const { calcularValorAReceberVenda } = require('./formaPagamentoAReceber');
  const valorAReceber = await calcularValorAReceberVenda(db, venda.rows[0]?.pagamentos);

  return {
    ...entrega,
    valor_a_receber: valorAReceber,
    tem_a_receber: valorAReceber > 0,
    quantidade_volumes: entrega.quantidade_volumes || entrega.volumes_calculados || 1,
  };
}

module.exports = {
  criarEntregaInicial,
  sincronizarItensFaltantesEntrega,
  sincronizarEntregasVenda,
  backfillEntregasExistentes,
  listEntregas,
  listEntregasAgendadas,
  agendarExpedicao,
  criarAssistenciaEntrega,
  atualizarEntregaKanban,
  confirmarAgendamentoCliente,
  getEntrega,
  atualizarEntrega,
  registrarEntrega,
  getDadosTicketEntrega,
  atualizarStatusEntrega,
  recalcularIndicesEntrega,
};
