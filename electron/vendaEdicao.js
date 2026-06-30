const { getPool } = require('./database');
const { getSession } = require('./auth');
const { assertVendaAcessivel } = require('./vendedorUsuario');
const entregas = require('./entregas');
const encomendas = require('./encomendas');
const markupVendas = require('./markupVendas');
const formasPagamentoCadastro = require('./formasPagamento');
const { calcularSubtotalBruto, aplicarPrecosEfetivosNosItens } = require('./precosEfetivos');
const { normalizarStatusItem } = require('./vendaItemStatus');
const { getVenda, normalizarPagamentos, calcularTotalPagamentos, enriquecerPagamentos } = require('./vendas');
const { sincronizarComissoesVenda } = require('./comissaoVendas');

const AMBIENTE_NOME_PADRAO = 'Geral';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function serializarPagamentos(pagamentos) {
  return JSON.stringify(
    normalizarPagamentos(pagamentos)
      .map((p) => ({
        forma_pagamento_id: p.forma_pagamento_id ? Number(p.forma_pagamento_id) : null,
        valor: round2(p.valor),
        parcelas: Math.max(Number(p.parcelas) || 1, 1),
        observacao: String(p.observacao || '').trim(),
        data_recebimento: p.data_recebimento ? String(p.data_recebimento).slice(0, 10) : null,
      }))
      .sort((a, b) => (
        (a.forma_pagamento_id || 0) - (b.forma_pagamento_id || 0)
        || a.valor - b.valor
      ))
  );
}

async function validarPagamentosEdicao(pagamentosRaw) {
  const lista = normalizarPagamentos(pagamentosRaw);
  if (lista.length === 0) {
    throw new Error('Adicione pelo menos um pagamento com valor maior que zero.');
  }

  const mapFormas = await formasPagamentoCadastro.getFormasPagamentoMap(
    lista.map((p) => p.forma_pagamento_id)
  );

  return lista.map((p) => {
    if (!p.forma_pagamento_id) {
      throw new Error('Selecione a forma de pagamento em todas as linhas.');
    }
    if (!mapFormas[p.forma_pagamento_id]) {
      throw new Error('Forma de pagamento inválida ou inativa.');
    }
    return {
      ...p,
      forma_nome: mapFormas[p.forma_pagamento_id].nome,
    };
  });
}

function ajustarPagamentosPorValor(pagamentos, novoTotal) {
  const lista = normalizarPagamentos(pagamentos);
  const totalAtual = calcularTotalPagamentos(lista);
  if (lista.length === 0 || totalAtual <= 0) return lista;
  if (novoTotal <= 0) {
    return lista.map((p) => ({ ...p, valor: 0 }));
  }
  if (Math.abs(totalAtual - novoTotal) < 0.01) return lista;

  const fator = novoTotal / totalAtual;
  let acumulado = 0;
  return lista.map((p, index) => {
    if (index === lista.length - 1) {
      return { ...p, valor: round2(Math.max(novoTotal - acumulado, 0)) };
    }
    const valor = round2(p.valor * fator);
    acumulado += valor;
    return { ...p, valor };
  }).filter((p) => p.valor > 0);
}

async function agruparItensEfetivosPorAmbiente(client, vendaId) {
  const ambientesResult = await client.query(`
    SELECT * FROM venda_ambientes WHERE venda_id = $1 ORDER BY ordem, id
  `, [vendaId]);

  const ambientes = [];
  for (const ambiente of ambientesResult.rows) {
    const itens = await client.query(`
      SELECT * FROM venda_itens
      WHERE ambiente_id = $1 AND status = 'efetivo'
      ORDER BY ordem, id
    `, [ambiente.id]);
    if (itens.rowCount > 0) {
      ambientes.push({
        nome: ambiente.nome,
        itens: itens.rows.map((item) => ({
          id: item.id,
          status: item.status,
          quantidade: Number(item.quantidade),
          preco_unitario: Number(item.preco_unitario),
          preco_unitario_lista: item.preco_unitario_lista != null
            ? Number(item.preco_unitario_lista)
            : Number(item.preco_unitario),
        })),
      });
    }
  }
  return ambientes;
}

async function recalcularTotaisVenda(client, vendaId, pagamentosOverride = null) {
  const vendaRow = await client.query('SELECT pagamentos, total_pago FROM vendas WHERE id = $1', [vendaId]);
  const ambientes = await agruparItensEfetivosPorAmbiente(client, vendaId);
  const subtotalBruto = calcularSubtotalBruto(ambientes);

  let pagamentos = pagamentosOverride || normalizarPagamentos(vendaRow.rows[0]?.pagamentos);
  const totalPago = calcularTotalPagamentos(pagamentos);

  aplicarPrecosEfetivosNosItens(ambientes, totalPago);

  for (const ambiente of ambientes) {
    for (const item of ambiente.itens) {
      const subtotal = round2(item.quantidade * item.preco_unitario);
      await client.query(`
        UPDATE venda_itens
        SET preco_unitario_lista = $2,
            preco_unitario = $3,
            subtotal = $4
        WHERE id = $1
      `, [item.id, item.preco_unitario_lista, item.preco_unitario, subtotal]);
    }
  }

  const descontoExtra = Math.max(subtotalBruto - totalPago, 0);
  const pagamentosEnriquecidos = await enriquecerPagamentos(pagamentos);

  await client.query(`
    UPDATE vendas
    SET subtotal = $2,
        subtotal_bruto = $2,
        desconto = $3,
        desconto_extra = $3,
        pagamentos = $4,
        total_pago = $5,
        total = $5,
        atualizado_em = NOW()
    WHERE id = $1
  `, [
    vendaId,
    subtotalBruto,
    descontoExtra,
    JSON.stringify(pagamentosEnriquecidos),
    totalPago,
  ]);

  return { subtotalBruto, totalPago, descontoExtra };
}

async function zerarItemNaoEfetivo(client, itemId, status, motivo = null) {
  await client.query(`
    UPDATE venda_itens
    SET status = $2,
        status_motivo = $3,
        subtotal = 0,
        preco_unitario = 0,
        custo_unitario_esperado = 0,
        markup_esperado = NULL,
        custo_unitario_real = NULL,
        markup_real = NULL,
        quantidade_estoque = 0,
        quantidade_encomenda = 0
    WHERE id = $1
  `, [itemId, status, motivo]);

  await client.query(`
    UPDATE estoque_reservas
    SET status = 'cancelada', atualizado_em = NOW()
    WHERE venda_item_id = $1 AND status = 'ativa'
  `, [itemId]);

  await client.query('DELETE FROM venda_comissoes WHERE venda_item_id = $1', [itemId]);
}

async function converterConsignadoParaEfetivo(client, vendaId, item) {
  const quantidade = Number(item.quantidade) || 0;
  const qtdEntregue = Number(item.quantidade_entregue) || 0;
  let precoLista = Number(item.preco_unitario_lista) || 0;

  if (precoLista <= 0 && item.produto_id) {
    const prod = await client.query('SELECT preco_venda FROM produtos WHERE id = $1', [item.produto_id]);
    precoLista = Number(prod.rows[0]?.preco_venda) || 0;
  }
  if (precoLista <= 0) {
    throw new Error(`Preço de referência não definido para "${item.descricao}".`);
  }

  const qtdPendente = Math.max(quantidade - qtdEntregue, 0);
  const quantidadeEstoque = qtdPendente > 0 ? quantidade : quantidade;
  const quantidadeEncomenda = 0;
  const subtotal = round2(quantidade * precoLista);

  await client.query(`
    UPDATE venda_itens
    SET status = 'efetivo',
        status_motivo = NULL,
        preco_unitario_lista = $2,
        preco_unitario = $2,
        subtotal = $3,
        quantidade_estoque = $4,
        quantidade_encomenda = $5
    WHERE id = $1
  `, [item.id, precoLista, subtotal, quantidadeEstoque, quantidadeEncomenda]);

  const atualizado = await client.query(`
    SELECT vi.*, p.fornecedor_id, p.preco_custo, p.nome AS produto_nome
    FROM venda_itens vi
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE vi.id = $1
  `, [item.id]);

  await encomendas.confirmarItemEfetivo(client, vendaId, atualizado.rows[0]);
  await markupVendas.aplicarCustosMarkupVendaItem(client, item.id);
}

async function registrarAlteracaoVenda(client, {
  vendaId,
  vendaItemId,
  tipo,
  descricao,
  motivo,
  valorAnterior,
  valorNovo,
  session,
}) {
  await client.query(`
    INSERT INTO venda_alteracoes (
      venda_id, venda_item_id, tipo, descricao, motivo,
      valor_anterior, valor_novo, usuario_id, usuario_nome
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    vendaId,
    vendaItemId || null,
    tipo,
    descricao,
    motivo,
    valorAnterior != null ? round2(valorAnterior) : null,
    valorNovo != null ? round2(valorNovo) : null,
    session?.id || null,
    session?.nome || null,
  ]);
}

async function listAlteracoesVenda(vendaId) {
  const db = getPool();
  const result = await db.query(`
    SELECT * FROM venda_alteracoes
    WHERE venda_id = $1
    ORDER BY criado_em DESC, id DESC
  `, [vendaId]);
  return result.rows;
}

async function editarVenda(vendaId, data) {
  const session = getSession();
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const vendaAtual = await getVenda(vendaId);
    if (!vendaAtual) throw new Error('Venda não encontrada.');
    if (vendaAtual.desativada) {
      throw new Error('Não é possível editar uma venda desativada. Restaure-a antes de alterar.');
    }
    assertVendaAcessivel(session, vendaAtual, 'venda');

    const valorAnteriorPedido = Number(vendaAtual.total) || 0;
    const alteracoes = data.alteracoes_itens || [];
    const novosConsignados = data.novos_itens_consignados || [];
    const registrosAlteracao = [];
    let pagamentosOverride = null;

    for (const alt of alteracoes) {
      const itemId = Number(alt.venda_item_id);
      if (!itemId) continue;

      const itemResult = await client.query('SELECT * FROM venda_itens WHERE id = $1 AND venda_id = $2', [itemId, vendaId]);
      if (itemResult.rowCount === 0) throw new Error('Item da venda não encontrado.');
      const item = itemResult.rows[0];
      const statusAtual = normalizarStatusItem(item.status);
      const statusNovo = normalizarStatusItem(alt.status);
      if (statusAtual === statusNovo) continue;

      if (statusNovo === 'cancelado' && !String(alt.motivo || '').trim()) {
        throw new Error(`Informe a justificativa para cancelar "${item.descricao}".`);
      }
      if (Number(item.quantidade_entregue) > 0 && statusNovo === 'cancelado') {
        throw new Error(`Não é possível cancelar "${item.descricao}" — já houve entrega parcial.`);
      }

      const motivo = String(alt.motivo || '').trim() || null;

      if (statusNovo === 'cancelado') {
        await zerarItemNaoEfetivo(client, itemId, 'cancelado', motivo);
        registrosAlteracao.push({
          vendaItemId: itemId,
          tipo: 'cancelamento_item',
          descricao: `Item cancelado: ${item.descricao}`,
          motivo,
        });
      } else if (statusNovo === 'consignado') {
        await zerarItemNaoEfetivo(client, itemId, 'consignado', motivo);
        registrosAlteracao.push({
          vendaItemId: itemId,
          tipo: 'item_consignado',
          descricao: `Item alterado para consignado: ${item.descricao}`,
          motivo: motivo || 'Alteração para consignado',
        });
      } else if (statusNovo === 'efetivo' && statusAtual === 'consignado') {
        await converterConsignadoParaEfetivo(client, vendaId, item);
        registrosAlteracao.push({
          vendaItemId: itemId,
          tipo: 'item_efetivado',
          descricao: `Item consignado efetivado na venda: ${item.descricao}`,
          motivo: motivo || 'Efetivação de item consignado',
        });
      } else if (statusNovo === 'efetivo') {
        throw new Error('Não é possível alterar este item para Efetivo.');
      }
    }

    let ambientePadraoId = vendaAtual.ambientes?.[0]?.id;
    if (!ambientePadraoId) {
      const amb = await client.query(`
        INSERT INTO venda_ambientes (venda_id, nome, ordem)
        VALUES ($1, $2, 0)
        RETURNING id
      `, [vendaId, AMBIENTE_NOME_PADRAO]);
      ambientePadraoId = amb.rows[0].id;
    }

    for (const novo of novosConsignados) {
      const descricao = String(novo.descricao || '').trim();
      const quantidade = Number(novo.quantidade) || 0;
      if (!descricao || quantidade <= 0) continue;

      const precoLista = Number(novo.preco_unitario) || 0;
      const inserted = await client.query(`
        INSERT INTO venda_itens (
          venda_id, ambiente_id, produto_id, descricao, quantidade,
          quantidade_estoque, quantidade_encomenda,
          preco_unitario_lista, preco_unitario, subtotal, ordem, status
        )
        VALUES ($1, $2, $3, $4, $5, 0, 0, $6, 0, 0, $7, 'consignado')
        RETURNING id
      `, [
        vendaId,
        novo.ambiente_id || ambientePadraoId,
        novo.produto_id || null,
        descricao,
        quantidade,
        precoLista,
        Number(novo.ordem) || 0,
      ]);

      registrosAlteracao.push({
        vendaItemId: inserted.rows[0].id,
        tipo: 'inclusao_consignado',
        descricao: `Item consignado incluído: ${descricao}`,
        motivo: String(novo.motivo || data.motivo_geral || 'Inclusão de item consignado').trim(),
      });
    }

    if (data.pagamentos != null) {
      const pagamentosValidados = await validarPagamentosEdicao(data.pagamentos);
      if (serializarPagamentos(pagamentosValidados) !== serializarPagamentos(vendaAtual.pagamentos)) {
        pagamentosOverride = pagamentosValidados;
        registrosAlteracao.push({
          vendaItemId: null,
          tipo: 'alteracao_pagamento',
          descricao: 'Formas de pagamento alteradas',
          motivo: String(data.motivo_pagamento || 'Atualização das formas de pagamento').trim(),
        });
      }
    }

    if (data.observacoes !== undefined
      && String(data.observacoes || '').trim() !== String(vendaAtual.observacoes || '').trim()) {
      await client.query(`
        UPDATE vendas SET observacoes = $2, atualizado_em = NOW() WHERE id = $1
      `, [vendaId, String(data.observacoes || '').trim() || null]);
      registrosAlteracao.push({
        vendaItemId: null,
        tipo: 'alteracao_observacoes',
        descricao: 'Observações do pedido atualizadas',
        motivo: String(data.motivo_geral || 'Atualização das observações').trim(),
      });
    }

    if (registrosAlteracao.length === 0) {
      throw new Error('Nenhuma alteração informada.');
    }

    const totais = await recalcularTotaisVenda(client, vendaId, pagamentosOverride);
    await entregas.sincronizarEntregasVenda(client, vendaId, vendaAtual.entrega_tipo_liberacao || 'parcial');

    const notas = registrosAlteracao.map((r) => r.descricao).join('; ');
    await client.query(`
      UPDATE vendas
      SET tem_alteracao_pos_venda = TRUE,
          nota_alteracao = CASE
            WHEN COALESCE(nota_alteracao, '') = '' THEN $2
            ELSE nota_alteracao || E'\n' || $2
          END
      WHERE id = $1
    `, [vendaId, notas]);

    for (const reg of registrosAlteracao) {
      await registrarAlteracaoVenda(client, {
        vendaId,
        vendaItemId: reg.vendaItemId,
        tipo: reg.tipo,
        descricao: reg.descricao,
        motivo: reg.motivo,
        valorAnterior: valorAnteriorPedido,
        valorNovo: totais.totalPago,
        session,
      });
    }

    await client.query('COMMIT');
    await sincronizarComissoesVenda(vendaId);

    const salva = await getVenda(vendaId);
    const alteracoesLista = await listAlteracoesVenda(vendaId);
    return { venda: salva, alteracoes: alteracoesLista, totais };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  editarVenda,
  listAlteracoesVenda,
  recalcularTotaisVenda,
};
