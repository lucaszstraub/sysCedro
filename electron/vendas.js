const { getPool } = require('./database');
const { assertClienteParaVenda } = require('./clienteValidacao');
const { getSession } = require('./auth');
const {
  buildFiltroVendedorSql,
  buildFiltroVendasAtivasSql,
  assertAcessoVendedorRecurso,
  assertVendaAcessivel,
  aplicarVendedorIdSessao,
} = require('./vendedorUsuario');
const { userIsGerenteOuAdministrador } = require('./permissions');
const { sincronizarComissoesVenda } = require('./comissaoVendas');
const entregas = require('./entregas');
const orcamentos = require('./orcamentos');
const encomendas = require('./encomendas');
const formasPagamentoCadastro = require('./formasPagamento');
const markupVendas = require('./markupVendas');
const { normalizarStatusItem, itemContaParaTotal } = require('./vendaItemStatus');
const { calcularSubtotalBruto, aplicarPrecosEfetivosNosItens } = require('./precosEfetivos');
const { enriquecerVendasComPendencias, enriquecerVendaComPendencias } = require('./vendaPendencias');

const AMBIENTE_NOME_PADRAO = 'Geral';

const FORMAS_PAGAMENTO_PADRAO = [
  { id: 'avista', nome: 'À vista', desconto_percentual: 10 },
  { id: 'cartao_1_6', nome: 'Cartão 1+6x', desconto_percentual: 5 },
  { id: 'cartao_6_10', nome: 'Cartão 6x a 10x', desconto_percentual: 0 },
];

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
    data_recebimento: p.data_recebimento ? String(p.data_recebimento).slice(0, 10) : null,
  })).filter((p) => p.valor > 0);
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

function calcularTotalPagamentos(pagamentos) {
  return normalizarPagamentos(pagamentos).reduce((sum, p) => sum + p.valor, 0);
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
    SELECT id FROM vendas
    WHERE numero_pedido = $1
      AND COALESCE(desativada, false) = false
      AND ($2::int IS NULL OR id != $2)
  `, [numeroPedido, excludeId]);
  if (result.rowCount > 0) {
    throw new Error(`O número do pedido ${numeroPedido} já está em uso.`);
  }
}

async function gerarNumeroVenda() {
  const db = getPool();
  const result = await db.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^VEN-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM vendas
    WHERE numero LIKE 'VEN-%'
  `);
  return `VEN-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

async function listVendas(busca = '') {
  const db = getPool();
  const params = [`%${busca}%`];
  const filtro = buildFiltroVendedorSql(getSession(), 'v', params);
  const result = await db.query(`
    SELECT v.*, c.nome AS cliente_nome, o.numero AS orcamento_numero,
           vd.nome AS vendedor_nome
    FROM vendas v
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN orcamentos o ON o.id = v.orcamento_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE ($1 = '' OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1
           OR c.nome ILIKE $1 OR o.numero ILIKE $1)
      ${buildFiltroVendasAtivasSql('v')}
    ${filtro.sql}
    ORDER BY v.criado_em DESC
  `, params);
  return enriquecerVendasComPendencias(db, result.rows);
}

async function listVendasDesativadas(busca = '') {
  const session = getSession();
  if (!userIsGerenteOuAdministrador(session)) {
    throw new Error('Acesso restrito a gerentes e administradores.');
  }
  const db = getPool();
  const params = [`%${busca}%`];
  const result = await db.query(`
    SELECT v.*, c.nome AS cliente_nome, o.numero AS orcamento_numero,
           vd.nome AS vendedor_nome
    FROM vendas v
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN orcamentos o ON o.id = v.orcamento_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE v.desativada = true
      AND ($1 = '' OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1
           OR c.nome ILIKE $1 OR o.numero ILIKE $1 OR vd.nome ILIKE $1)
    ORDER BY v.desativada_em DESC NULLS LAST, v.criado_em DESC
  `, params);
  return result.rows;
}

async function getVenda(id) {
  const db = getPool();
  const venda = await db.query(`
    SELECT v.*, c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj,
           c.telefone AS cliente_telefone, c.email AS cliente_email,
           c.endereco AS cliente_endereco, c.cidade AS cliente_cidade,
           c.estado AS cliente_estado, c.cep AS cliente_cep,
           c.observacoes AS cliente_observacoes,
           o.numero AS orcamento_numero,
           vd.nome AS vendedor_nome, vd.email AS vendedor_email,
           vd.telefone AS vendedor_telefone
    FROM vendas v
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN orcamentos o ON o.id = v.orcamento_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE v.id = $1
  `, [id]);

  if (venda.rowCount === 0) return null;

  const row = venda.rows[0];
  assertVendaAcessivel(getSession(), row);
  row.pagamentos = await enriquecerPagamentos(normalizarPagamentos(row.pagamentos));
  if (row.pagamentos.length === 0) {
    const valor = Number(row.total_pago) || Number(row.total) || 0;
    if (valor > 0) {
      row.pagamentos = [{
        id: 'legado',
        tipo: 'pix',
        valor,
        parcelas: 1,
        observacao: '',
      }];
    }
  }

  const ambientesResult = await db.query(`
    SELECT * FROM venda_ambientes
    WHERE venda_id = $1
    ORDER BY ordem, id
  `, [id]);

  const ambientes = [];
  for (const ambiente of ambientesResult.rows) {
    const itens = await db.query(`
      SELECT vi.*, p.sku AS produto_sku, p.foto_path AS produto_foto_path
      FROM venda_itens vi
      LEFT JOIN produtos p ON p.id = vi.produto_id
      WHERE vi.ambiente_id = $1
      ORDER BY vi.ordem, vi.id
    `, [ambiente.id]);
    ambientes.push({ ...ambiente, itens: itens.rows });
  }

  const entregaResult = await db.query(`
    SELECT tipo_liberacao FROM entregas
    WHERE venda_id = $1
    ORDER BY numero
    LIMIT 1
  `, [id]);

  const detalhe = {
    ...row,
    ambientes,
    entrega_tipo_liberacao: entregaResult.rows[0]?.tipo_liberacao || 'parcial',
  };
  return enriquecerVendaComPendencias(db, detalhe);
}

async function salvarVenda(data, id = null) {
  if (id) {
    throw new Error('Para alterar uma venda já confirmada, use Editar venda no menu de vendas.');
  }
  const session = getSession();
  data = aplicarVendedorIdSessao(data, session);
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    if (id) {
      const atual = await client.query('SELECT vendedor_id FROM vendas WHERE id = $1', [id]);
      if (atual.rowCount === 0) throw new Error('Venda não encontrada.');
      assertAcessoVendedorRecurso(session, atual.rows[0].vendedor_id, 'venda');
    }

    if (!data.cliente_id) throw new Error('Selecione um cliente para a venda.');
    await assertClienteParaVenda(client, data.cliente_id);
    const numeroPedido = normalizarNumeroPedido(data.numero_pedido);
    await assertNumeroPedidoUnico(client, numeroPedido, id);
    if (!data.ambientes || data.ambientes.length === 0) {
      throw new Error('Adicione pelo menos um ambiente à venda.');
    }

    const ambientesValidos = data.ambientes
      .map((ambiente) => ({
        nome: (ambiente.nome || '').trim() || AMBIENTE_NOME_PADRAO,
        itens: (ambiente.itens || [])
          .filter((item) => item.descricao && item.descricao.trim())
          .map((item) => {
            const quantidade = Number(item.quantidade) || 1;
            const status = normalizarStatusItem(item.status || 'efetivo');
            let quantidadeEstoque = item.quantidade_estoque;
            let quantidadeEncomenda = item.quantidade_encomenda;
            if (!itemContaParaTotal(status)) {
              quantidadeEstoque = 0;
              quantidadeEncomenda = 0;
            } else if (quantidadeEstoque === undefined && quantidadeEncomenda === undefined) {
              quantidadeEstoque = quantidade;
              quantidadeEncomenda = 0;
            }
            quantidadeEstoque = Number(quantidadeEstoque) || 0;
            quantidadeEncomenda = Number(quantidadeEncomenda) || 0;
            if (itemContaParaTotal(status) && quantidadeEstoque + quantidadeEncomenda !== quantidade) {
              throw new Error(
                `Item "${item.descricao.trim()}": estoque (${quantidadeEstoque}) + encomenda (${quantidadeEncomenda}) deve ser igual à quantidade (${quantidade}).`
              );
            }
            return {
              produto_id: item.produto_id || null,
              descricao: item.descricao.trim(),
              quantidade,
              quantidade_estoque: quantidadeEstoque,
              quantidade_encomenda: quantidadeEncomenda,
              preco_unitario: Number(item.preco_unitario) || 0,
              preco_unitario_lista: item.preco_unitario_lista != null
                ? Number(item.preco_unitario_lista) || 0
                : undefined,
              status: normalizarStatusItem(item.status || 'efetivo'),
            };
          }),
      }))
      .filter((ambiente) => ambiente.itens.length > 0);

    if (ambientesValidos.length === 0) {
      throw new Error('Adicione pelo menos um ambiente com itens à venda.');
    }

    const possuiItemEfetivo = ambientesValidos.some((ambiente) => (
      ambiente.itens.some((item) => itemContaParaTotal(item.status))
    ));
    if (!possuiItemEfetivo && !ambientesValidos.some((a) => a.itens.some((i) => i.status === 'consignado'))) {
      throw new Error('A venda precisa ter ao menos um item efetivo ou consignado.');
    }

    const subtotalBruto = calcularSubtotalBruto(ambientesValidos);

    const pagamentosRaw = normalizarPagamentos(data.pagamentos);
    if (pagamentosRaw.length === 0 && subtotalBruto > 0.005) {
      throw new Error('Adicione pelo menos um pagamento com valor maior que zero.');
    }

    const mapFormas = await formasPagamentoCadastro.getFormasPagamentoMap(
      pagamentosRaw.map((p) => p.forma_pagamento_id)
    );
    const pagamentos = pagamentosRaw.length > 0 ? pagamentosRaw.map((p) => {
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
    }) : [];

    const totalPago = subtotalBruto <= 0 ? 0 : calcularTotalPagamentos(pagamentos);
    const descontoExtra = Math.max(subtotalBruto - totalPago, 0);

    aplicarPrecosEfetivosNosItens(ambientesValidos, totalPago);

    let venda;

    const numero = await gerarNumeroVenda();
    const created = await client.query(`
      INSERT INTO vendas (
        numero, numero_pedido, cliente_id, orcamento_id, vendedor_id, status, observacoes,
        subtotal, subtotal_bruto, desconto, desconto_extra, pagamentos, total_pago, total
      )
      VALUES ($1, $2, $3, $4, $5, 'confirmada', $6, $7, $7, $8, $8, $9, $10, $10)
      RETURNING *
    `, [
      numero,
      numeroPedido,
      data.cliente_id,
      data.orcamento_id || null,
      data.vendedor_id || null,
      data.observacoes || null,
      subtotalBruto,
      descontoExtra,
      JSON.stringify(pagamentos),
      totalPago,
    ]);
    venda = created.rows[0];

    for (let a = 0; a < ambientesValidos.length; a++) {
      const ambiente = ambientesValidos[a];
      const ambienteRow = await client.query(`
        INSERT INTO venda_ambientes (venda_id, nome, ordem)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [venda.id, ambiente.nome, a]);

      const ambienteId = ambienteRow.rows[0].id;

      for (let i = 0; i < ambiente.itens.length; i++) {
        const item = ambiente.itens[i];
        const status = normalizarStatusItem(item.status || 'efetivo');
        const contaTotal = itemContaParaTotal(status);
        const itemSubtotal = contaTotal ? Number(item.quantidade) * Number(item.preco_unitario) : 0;
        const qtdEstoque = contaTotal ? item.quantidade_estoque : 0;
        const qtdEncomenda = contaTotal ? item.quantidade_encomenda : 0;
        const inserted = await client.query(`
          INSERT INTO venda_itens (
            venda_id, ambiente_id, produto_id, descricao, quantidade,
            quantidade_estoque, quantidade_encomenda,
            preco_unitario_lista, preco_unitario, subtotal, ordem, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `, [
          venda.id,
          ambienteId,
          item.produto_id || null,
          item.descricao,
          item.quantidade,
          qtdEstoque,
          qtdEncomenda,
          item.preco_unitario_lista ?? item.preco_unitario,
          contaTotal ? item.preco_unitario : 0,
          itemSubtotal,
          i,
          status,
        ]);
        if (contaTotal) {
          await markupVendas.aplicarCustosMarkupVendaItem(client, inserted.rows[0].id);
        }
      }
    }

    if (venda.orcamento_id) {
      await orcamentos.aprovarOrcamentoVinculado(venda.orcamento_id, client);
    }
    await encomendas.processarConfirmacaoVenda(venda.id, client);
    await entregas.sincronizarEntregasVenda(
      client,
      venda.id,
      data.entrega_tipo_liberacao || 'parcial'
    );

    await client.query('COMMIT');
    await sincronizarComissoesVenda(venda.id);
    return getVenda(venda.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteVenda(id) {
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const atual = await client.query(
      'SELECT vendedor_id, desativada FROM vendas WHERE id = $1',
      [id]
    );
    if (atual.rowCount === 0) throw new Error('Venda não encontrada.');
    if (atual.rows[0].desativada) throw new Error('Esta venda já está desativada.');

    assertAcessoVendedorRecurso(getSession(), atual.rows[0].vendedor_id, 'venda');

    await encomendas.processarCancelamentoVenda(id, client);
    await client.query('DELETE FROM venda_comissoes WHERE venda_id = $1', [id]);
    await client.query('DELETE FROM entregas WHERE venda_id = $1', [id]);

    await client.query(`
      UPDATE vendas
      SET desativada = true,
          desativada_em = NOW(),
          atualizado_em = NOW()
      WHERE id = $1
    `, [id]);

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function restaurarVenda(id) {
  const session = getSession();
  if (!userIsGerenteOuAdministrador(session)) {
    throw new Error('Apenas gerentes e administradores podem restaurar vendas desativadas.');
  }

  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const atual = await client.query(
      'SELECT * FROM vendas WHERE id = $1',
      [id]
    );
    if (atual.rowCount === 0) throw new Error('Venda não encontrada.');
    if (!atual.rows[0].desativada) throw new Error('Esta venda não está desativada.');

    await client.query(`
      UPDATE vendas
      SET desativada = false,
          desativada_em = NULL,
          atualizado_em = NOW()
      WHERE id = $1
    `, [id]);

    await encomendas.processarConfirmacaoVenda(id, client);

    const entregaTipo = await client.query(`
      SELECT tipo_liberacao FROM entregas WHERE venda_id = $1 LIMIT 1
    `, [id]);
    const tipoLiberacao = entregaTipo.rows[0]?.tipo_liberacao || 'parcial';
    await entregas.sincronizarEntregasVenda(client, id, tipoLiberacao);

    await client.query('COMMIT');
    await sincronizarComissoesVenda(id);
    return getVenda(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listVendas,
  listVendasDesativadas,
  getVenda,
  salvarVenda,
  deleteVenda,
  restaurarVenda,
  FORMAS_PAGAMENTO_PADRAO,
  normalizarPagamentos,
  calcularTotalPagamentos,
  enriquecerPagamentos,
};
