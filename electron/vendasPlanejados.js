const { getPool } = require('./database');
const { getSession } = require('./auth');
const {
  buildFiltroVendedorSql,
  assertAcessoVendedorRecurso,
  aplicarVendedorIdSessao,
} = require('./vendedorUsuario');
const formasPagamentoCadastro = require('./formasPagamento');
const anexosVendaPlanejado = require('./anexosVendaPlanejado');
const { normalizarItemPlanejado } = require('./produtosPlanejados');
const { ensureAcompanhamentoVenda } = require('./acompanhamentoPedidosPlanejados');
const { calcularSubtotalBruto, aplicarPrecosEfetivosNosItens } = require('./precosEfetivos');

const AMBIENTE_NOME_PADRAO = 'Geral';

const TIPOS_PAGAMENTO_VALIDOS = new Set([
  'dinheiro', 'pix', 'credito', 'debito', 'boleto', 'transferencia', 'cheque',
]);

const TIPO_PAGAMENTO_LABEL = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  credito: 'Cartão crédito',
  debito: 'Cartão débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  cheque: 'Cheque',
};

function flattenItens(ambientes) {
  return ambientes.flatMap((ambiente) => ambiente.itens || []);
}

function calcularSubtotal(ambientes) {
  return calcularSubtotalBruto(ambientes);
}

function normalizarNumeroPedido(valor) {
  const numero = String(valor || '').trim();
  if (!/^\d{5}$/.test(numero)) {
    throw new Error('O número do pedido deve ter exatamente 5 dígitos.');
  }
  return numero;
}

async function assertNumeroPedidoUnico(client, numeroPedido, excludeId = null) {
  const result = await client.query(`
    SELECT id FROM vendas_planejados
    WHERE numero_pedido = $1 AND ($2::int IS NULL OR id != $2)
  `, [numeroPedido, excludeId]);
  if (result.rowCount > 0) {
    throw new Error(`O número do pedido ${numeroPedido} já está em uso.`);
  }
}

async function gerarNumeroVendaPlanejado() {
  const db = getPool();
  const result = await db.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^VEN-PL-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM vendas_planejados
    WHERE numero LIKE 'VEN-PL-%'
  `);
  return `VEN-PL-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

function normalizarItem(item) {
  return normalizarItemPlanejado(item);
}

function normalizarPagamentos(pagamentos) {
  if (!pagamentos || !Array.isArray(pagamentos) || pagamentos.length === 0) {
    return [];
  }
  return pagamentos.map((p) => ({
    id: p.id || `pag_${Date.now()}`,
    forma_pagamento_id: p.forma_pagamento_id ? Number(p.forma_pagamento_id) : null,
    tipo: p.tipo && TIPOS_PAGAMENTO_VALIDOS.has(p.tipo) ? p.tipo : null,
    valor: Number(p.valor) || 0,
    parcelas: Math.max(Number(p.parcelas) || 1, 1),
    observacao: p.observacao || '',
  })).filter((p) => p.valor > 0);
}

function calcularTotalPagamentos(pagamentos) {
  return normalizarPagamentos(pagamentos).reduce((sum, p) => sum + p.valor, 0);
}

async function enriquecerPagamentos(pagamentos) {
  const map = await formasPagamentoCadastro.getFormasPagamentoMap(
    pagamentos.map((p) => p.forma_pagamento_id)
  );
  return pagamentos.map((p) => ({
    ...p,
    forma_nome: p.forma_pagamento_id
      ? map[p.forma_pagamento_id]?.nome
      : (p.tipo ? TIPO_PAGAMENTO_LABEL[p.tipo] : null),
  }));
}

async function listVendasPlanejados(busca = '') {
  const db = getPool();
  const params = [`%${busca}%`];
  const filtro = buildFiltroVendedorSql(getSession(), 'v', params);
  const result = await db.query(`
    SELECT v.*, c.nome AS cliente_nome, o.numero AS orcamento_planejado_numero,
           vd.nome AS vendedor_nome
    FROM vendas_planejados v
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN orcamentos_planejados o ON o.id = v.orcamento_planejado_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE ($1 = '' OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1
           OR c.nome ILIKE $1 OR o.numero ILIKE $1)
    ${filtro.sql}
    ORDER BY v.criado_em DESC
  `, params);
  return result.rows;
}

async function getVendaPlanejado(id) {
  const db = getPool();
  const venda = await db.query(`
    SELECT v.*, c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj,
           c.telefone AS cliente_telefone, c.email AS cliente_email,
           c.endereco AS cliente_endereco, c.cidade AS cliente_cidade,
           c.estado AS cliente_estado, c.cep AS cliente_cep,
           c.observacoes AS cliente_observacoes,
           o.numero AS orcamento_planejado_numero,
           vd.nome AS vendedor_nome
    FROM vendas_planejados v
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN orcamentos_planejados o ON o.id = v.orcamento_planejado_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE v.id = $1
  `, [id]);

  if (venda.rowCount === 0) return null;

  const row = venda.rows[0];
  assertAcessoVendedorRecurso(getSession(), row.vendedor_id, 'venda planejada');
  row.pagamentos = await enriquecerPagamentos(normalizarPagamentos(row.pagamentos));

  const ambientesResult = await db.query(`
    SELECT * FROM venda_planejado_ambientes
    WHERE venda_planejado_id = $1
    ORDER BY ordem, id
  `, [id]);

  const ambientes = [];
  for (const ambiente of ambientesResult.rows) {
    const itens = await db.query(`
      SELECT * FROM venda_planejado_itens
      WHERE ambiente_id = $1
      ORDER BY ordem, id
    `, [ambiente.id]);
    ambientes.push({ ...ambiente, itens: itens.rows });
  }

  const anexos = await db.query(`
    SELECT id, nome_original, caminho, tamanho_bytes, mime_type, ordem, criado_em
    FROM venda_planejado_anexos
    WHERE venda_planejado_id = $1
    ORDER BY ordem, id
  `, [id]);

  return { ...row, ambientes, anexos: anexos.rows };
}

async function processarAnexos(client, vendaId, anexosPayload = []) {
  const existentes = await client.query(
    'SELECT id, caminho FROM venda_planejado_anexos WHERE venda_planejado_id = $1',
    [vendaId]
  );
  const manterIds = new Set(
    anexosPayload.filter((a) => a.id && !a.remover).map((a) => Number(a.id))
  );

  for (const row of existentes.rows) {
    if (!manterIds.has(row.id)) {
      anexosVendaPlanejado.removerAnexoArquivo(row.caminho);
      await client.query('DELETE FROM venda_planejado_anexos WHERE id = $1', [row.id]);
    }
  }

  let ordem = 0;
  for (const anexo of anexosPayload) {
    if (anexo.remover) continue;
    if (anexo.id && manterIds.has(Number(anexo.id))) {
      await client.query(
        'UPDATE venda_planejado_anexos SET ordem = $2 WHERE id = $1',
        [anexo.id, ordem++]
      );
      continue;
    }
    if (!anexo.base64) continue;
    const salvo = anexosVendaPlanejado.salvarAnexoArquivo(vendaId, {
      nome_original: anexo.nome_original,
      base64: anexo.base64,
    });
    await client.query(`
      INSERT INTO venda_planejado_anexos (
        venda_planejado_id, nome_original, caminho, tamanho_bytes, mime_type, ordem
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      vendaId,
      salvo.nome_original,
      salvo.caminho,
      salvo.tamanho_bytes,
      salvo.mime_type,
      ordem++,
    ]);
  }
}

async function salvarVendaPlanejado(data, id = null) {
  const session = getSession();
  data = aplicarVendedorIdSessao(data, session);
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    if (id) {
      const atual = await client.query('SELECT vendedor_id FROM vendas_planejados WHERE id = $1', [id]);
      if (atual.rowCount === 0) throw new Error('Venda planejada não encontrada.');
      assertAcessoVendedorRecurso(session, atual.rows[0].vendedor_id, 'venda planejada');
    }

    if (!data.cliente_id) throw new Error('Selecione um cliente para a venda.');
    const numeroPedido = normalizarNumeroPedido(data.numero_pedido);
    await assertNumeroPedidoUnico(client, numeroPedido, id);

    if (!data.ambientes || data.ambientes.length === 0) {
      throw new Error('Adicione pelo menos um ambiente à venda.');
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

    const pagamentosRaw = normalizarPagamentos(data.pagamentos);
    if (pagamentosRaw.length === 0) {
      throw new Error('Adicione pelo menos um pagamento com valor maior que zero.');
    }

    const mapFormas = await formasPagamentoCadastro.getFormasPagamentoMap(
      pagamentosRaw.map((p) => p.forma_pagamento_id)
    );
    const pagamentos = pagamentosRaw.map((p) => {
      if (!p.forma_pagamento_id && !p.tipo) {
        throw new Error('Selecione a forma de pagamento em todas as linhas.');
      }
      if (p.forma_pagamento_id && !mapFormas[p.forma_pagamento_id]) {
        throw new Error('Forma de pagamento inválida ou inativa.');
      }
      return {
        ...p,
        forma_nome: p.forma_pagamento_id
          ? mapFormas[p.forma_pagamento_id].nome
          : TIPO_PAGAMENTO_LABEL[p.tipo],
      };
    });

    const subtotal = calcularSubtotal(ambientesValidos);
    const totalPago = calcularTotalPagamentos(pagamentos);
    const descontoExtra = Math.max(subtotal - totalPago, 0);

    aplicarPrecosEfetivosNosItens(ambientesValidos, totalPago);

    const prazoEntregaOutro = data.prazo_entrega_outro
      ? String(data.prazo_entrega_outro).trim()
      : null;
    const prazoEntregaDias = prazoEntregaOutro
      ? null
      : (Number(data.prazo_entrega_dias) || 60);

    const medidasConferidas = Boolean(data.medidas_conferidas);
    const responsavelMedidas = medidasConferidas
      ? ((data.responsavel_medidas || '').trim() || null)
      : null;

    let venda;

    if (id) {
      const updated = await client.query(`
        UPDATE vendas_planejados SET
          cliente_id = $2, orcamento_planejado_id = $3, vendedor_id = $4, status = 'confirmada',
          observacoes = $5, numero_pedido = $6,
          prazo_entrega_dias = $7, prazo_entrega_outro = $8,
          medidas_conferidas = $9, responsavel_medidas = $10,
          subtotal = $11, desconto_extra = $12, pagamentos = $13, total_pago = $14, total = $14,
          atualizado_em = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        id,
        data.cliente_id,
        data.orcamento_planejado_id || null,
        data.vendedor_id || null,
        data.observacoes || null,
        numeroPedido,
        prazoEntregaDias,
        prazoEntregaOutro,
        medidasConferidas,
        responsavelMedidas,
        subtotal,
        descontoExtra,
        JSON.stringify(pagamentos),
        totalPago,
      ]);
      venda = updated.rows[0];
      await client.query('DELETE FROM venda_planejado_ambientes WHERE venda_planejado_id = $1', [id]);
    } else {
      const numero = await gerarNumeroVendaPlanejado();
      const created = await client.query(`
        INSERT INTO vendas_planejados (
          numero, numero_pedido, cliente_id, orcamento_planejado_id, vendedor_id, status,
          observacoes, prazo_entrega_dias, prazo_entrega_outro,
          medidas_conferidas, responsavel_medidas,
          subtotal, desconto_extra, pagamentos, total_pago, total
        )
        VALUES ($1, $2, $3, $4, $5, 'confirmada', $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
        RETURNING *
      `, [
        numero,
        numeroPedido,
        data.cliente_id,
        data.orcamento_planejado_id || null,
        data.vendedor_id || null,
        data.observacoes || null,
        prazoEntregaDias,
        prazoEntregaOutro,
        medidasConferidas,
        responsavelMedidas,
        subtotal,
        descontoExtra,
        JSON.stringify(pagamentos),
        totalPago,
      ]);
      venda = created.rows[0];
    }

    for (let a = 0; a < ambientesValidos.length; a++) {
      const ambiente = ambientesValidos[a];
      const ambienteRow = await client.query(`
        INSERT INTO venda_planejado_ambientes (venda_planejado_id, nome, ordem)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [venda.id, ambiente.nome, a]);

      const ambienteId = ambienteRow.rows[0].id;

      for (let i = 0; i < ambiente.itens.length; i++) {
        const item = ambiente.itens[i];
        const itemSubtotal = Number(item.quantidade) * Number(item.preco_unitario);
        await client.query(`
          INSERT INTO venda_planejado_itens (
            venda_planejado_id, ambiente_id, produto_planejado_id, descricao,
            largura, profundidade, altura, espessura_mdf, padrao_mdf,
            tipo_fundo, tipo_porta, tipo_puxador, tipo_puxador_outro, cor_puxador,
            tipo_corredicas, canaleta_led, itens_extra,
            quantidade, preco_unitario, subtotal, ordem
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        `, [
          venda.id,
          ambienteId,
          item.produto_planejado_id || null,
          item.descricao,
          item.largura,
          item.profundidade,
          item.altura,
          item.espessura_mdf,
          item.padrao_mdf,
          item.tipo_fundo,
          item.tipo_porta,
          item.tipo_puxador,
          item.tipo_puxador_outro,
          item.cor_puxador,
          item.tipo_corredicas,
          item.canaleta_led,
          item.itens_extra,
          item.quantidade,
          item.preco_unitario,
          itemSubtotal,
          i,
        ]);
      }
    }

    await processarAnexos(client, venda.id, data.anexos || []);

    await ensureAcompanhamentoVenda(venda.id, client);

    await client.query('COMMIT');
    return getVendaPlanejado(venda.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteVendaPlanejado(id) {
  const db = getPool();
  const atual = await db.query('SELECT vendedor_id FROM vendas_planejados WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Venda planejada não encontrada.');
  assertAcessoVendedorRecurso(getSession(), atual.rows[0].vendedor_id, 'venda planejada');

  const anexos = await db.query(
    'SELECT caminho FROM venda_planejado_anexos WHERE venda_planejado_id = $1',
    [id]
  );
  for (const row of anexos.rows) {
    anexosVendaPlanejado.removerAnexoArquivo(row.caminho);
  }

  await db.query('DELETE FROM vendas_planejados WHERE id = $1', [id]);
  return { success: true };
}

async function abrirAnexoVendaPlanejado(vendaId, anexoId) {
  const db = getPool();
  const venda = await db.query('SELECT vendedor_id FROM vendas_planejados WHERE id = $1', [vendaId]);
  if (venda.rowCount === 0) throw new Error('Venda planejada não encontrada.');
  assertAcessoVendedorRecurso(getSession(), venda.rows[0].vendedor_id, 'venda planejada');

  const anexo = await db.query(
    'SELECT caminho FROM venda_planejado_anexos WHERE id = $1 AND venda_planejado_id = $2',
    [anexoId, vendaId]
  );
  if (anexo.rowCount === 0) throw new Error('Anexo não encontrado.');
  return anexosVendaPlanejado.abrirAnexo(anexo.rows[0].caminho);
}

module.exports = {
  listVendasPlanejados,
  getVendaPlanejado,
  salvarVendaPlanejado,
  deleteVendaPlanejado,
  abrirAnexoVendaPlanejado,
};
