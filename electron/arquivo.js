const { getPool } = require('./database');
const { getSession } = require('./auth');
const { ATRIBUICOES } = require('./permissions');
const {
  compararSnapshots,
  buildPreview,
  resumoFromAlteracoes,
  enriquecerRegistroArquivo,
} = require('./arquivoDiff');

function assertAdministrador(session = getSession()) {
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');
  if (!session.is_master && session.atribuicao !== ATRIBUICOES.ADMINISTRACAO) {
    throw new Error('Acesso restrito à administração do sistema.');
  }
}

function tituloFromSnapshot(tipoEntidade, dados) {
  if (tipoEntidade === 'venda') {
    const pedido = dados.numero_pedido ? ` · Pedido ${dados.numero_pedido}` : '';
    return `${dados.numero || 'Venda'}${pedido}`;
  }
  if (tipoEntidade === 'encomenda_fornecedor') {
    const fornecedor = dados.fornecedor_nome ? ` · ${dados.fornecedor_nome}` : '';
    return `${dados.numero || 'Encomenda'}${fornecedor}`;
  }
  return dados.numero || 'Registro';
}

async function registrarArquivo({
  tipoEntidade,
  entidadeId,
  motivo,
  dados,
  alteracoes = [],
  resumo = null,
  preview = null,
  session = getSession(),
}) {
  const db = getPool();
  const snapshot = typeof dados === 'string' ? JSON.parse(dados) : dados;
  const previewFinal = preview || buildPreview(tipoEntidade, snapshot);
  const alteracoesFinal = Array.isArray(alteracoes) ? alteracoes : [];
  const resumoFinal = resumo || resumoFromAlteracoes(
    alteracoesFinal,
    motivo,
    tipoEntidade,
    previewFinal
  );

  await db.query(`
    INSERT INTO arquivo_registros (
      tipo_entidade, entidade_id, numero_referencia, titulo, motivo, dados,
      resumo, alteracoes, preview,
      usuario_id, usuario_nome
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    tipoEntidade,
    entidadeId || null,
    snapshot.numero || null,
    tituloFromSnapshot(tipoEntidade, snapshot),
    motivo,
    JSON.stringify(snapshot),
    resumoFinal,
    JSON.stringify(alteracoesFinal),
    previewFinal ? JSON.stringify(previewFinal) : null,
    session?.id || null,
    session?.nome || null,
  ]);
}

async function registrarExclusao(tipoEntidade, entidadeId, dados, session) {
  const snapshot = typeof dados === 'string' ? JSON.parse(dados) : dados;
  const preview = buildPreview(tipoEntidade, snapshot);
  await registrarArquivo({
    tipoEntidade,
    entidadeId,
    motivo: 'exclusao',
    dados: snapshot,
    preview,
    session,
  });
}

async function registrarAlteracao(tipoEntidade, entidadeId, anterior, novo, session) {
  const alteracoes = compararSnapshots(tipoEntidade, anterior, novo);
  const preview = buildPreview(tipoEntidade, anterior);
  await registrarArquivo({
    tipoEntidade,
    entidadeId,
    motivo: 'alteracao',
    dados: anterior,
    alteracoes,
    preview,
    session,
  });
}

async function listArquivoRegistros({ motivo = null, tipo = null, busca = '' } = {}) {
  assertAdministrador();
  const db = getPool();
  const params = [];
  const where = [];

  if (motivo) {
    params.push(motivo);
    where.push(`motivo = $${params.length}`);
  }
  if (tipo) {
    params.push(tipo);
    where.push(`tipo_entidade = $${params.length}`);
  }
  if (busca.trim()) {
    params.push(`%${busca.trim()}%`);
    where.push(`(
      titulo ILIKE $${params.length}
      OR numero_referencia ILIKE $${params.length}
      OR usuario_nome ILIKE $${params.length}
    )`);
  }

  const sql = `
    SELECT id, tipo_entidade, entidade_id, numero_referencia, titulo, motivo,
           resumo, alteracoes, preview,
           usuario_id, usuario_nome, criado_em
    FROM arquivo_registros
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY criado_em DESC
    LIMIT 500
  `;
  const result = await db.query(sql, params);
  return result.rows.map((row) => {
    const alteracoes = typeof row.alteracoes === 'string'
      ? JSON.parse(row.alteracoes)
      : (row.alteracoes || []);
    const preview = typeof row.preview === 'string'
      ? JSON.parse(row.preview)
      : row.preview;
    return enriquecerRegistroArquivo({
      ...row,
      alteracoes,
      preview,
      dados: null,
    });
  });
}

async function getArquivoRegistro(id) {
  assertAdministrador();
  const db = getPool();
  const result = await db.query('SELECT * FROM arquivo_registros WHERE id = $1', [id]);
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  row.dados = typeof row.dados === 'string' ? JSON.parse(row.dados) : row.dados;
  row.alteracoes = typeof row.alteracoes === 'string'
    ? JSON.parse(row.alteracoes)
    : (row.alteracoes || []);
  row.preview = typeof row.preview === 'string'
    ? JSON.parse(row.preview)
    : row.preview;

  let estadoAtual = null;
  if (row.motivo === 'alteracao' && row.entidade_id) {
    if (row.tipo_entidade === 'venda') {
      const vendas = require('./vendas');
      estadoAtual = await vendas.getVenda(row.entidade_id);
    } else if (row.tipo_entidade === 'encomenda_fornecedor') {
      const encomendas = require('./encomendas');
      estadoAtual = await encomendas.getEncomendaFornecedor(row.entidade_id);
    }
  }

  return enriquecerRegistroArquivo(row, estadoAtual);
}

function vendaSnapshotToSavePayload(snapshot) {
  return {
    cliente_id: snapshot.cliente_id,
    orcamento_id: snapshot.orcamento_id || null,
    vendedor_id: snapshot.vendedor_id || null,
    numero_pedido: snapshot.numero_pedido,
    observacoes: snapshot.observacoes || '',
    entrega_tipo_liberacao: snapshot.entrega_tipo_liberacao || 'parcial',
    pagamentos: (snapshot.pagamentos || []).map((p) => ({
      id: p.id,
      forma_pagamento_id: p.forma_pagamento_id || null,
      tipo: p.tipo || null,
      valor: Number(p.valor) || 0,
      parcelas: Number(p.parcelas) || 1,
      observacao: p.observacao || '',
    })),
    ambientes: (snapshot.ambientes || []).map((ambiente) => ({
      nome: ambiente.nome,
      itens: (ambiente.itens || []).map((item) => ({
        produto_id: item.produto_id || null,
        descricao: item.descricao,
        quantidade: Number(item.quantidade) || 1,
        quantidade_estoque: item.quantidade_estoque ?? item.quantidade,
        quantidade_encomenda: item.quantidade_encomenda ?? 0,
        preco_unitario: Number(item.preco_unitario) || 0,
        preco_unitario_lista: item.preco_unitario_lista != null
          ? Number(item.preco_unitario_lista)
          : undefined,
      })),
    })),
  };
}

function encomendaSnapshotToSavePayload(snapshot) {
  const itens = snapshot.itens || [];
  const mapItem = (item) => ({
    id: item.id || null,
    venda_item_id: item.venda_item_id || null,
    venda_id: item.venda_id || null,
    produto_id: item.produto_id,
    quantidade_pedida: Number(item.quantidade_pedida) || 1,
    custo_negociado: Number(item.custo_negociado) || 0,
    previsao_entrega_dias: Number(item.previsao_entrega_dias) || Number(snapshot.previsao_entrega_dias) || 30,
    previsao_entrega: item.previsao_entrega || snapshot.previsao_entrega || null,
    destino_esperado: item.destino_esperado || (item.venda_item_id ? 'cliente' : 'estoque'),
    observacoes: item.observacoes || null,
  });

  return {
    fornecedor_id: snapshot.fornecedor_id,
    status: snapshot.status || 'rascunho',
    data_pedido: snapshot.data_pedido,
    previsao_entrega_dias: snapshot.previsao_entrega_dias,
    previsao_entrega: snapshot.previsao_entrega,
    frete_percentual: snapshot.frete_percentual,
    ipi_percentual: snapshot.ipi_percentual,
    observacoes: snapshot.observacoes || '',
    itens: itens.filter((i) => !i.venda_item_id).map(mapItem),
    itens_venda: itens.filter((i) => i.venda_item_id).map(mapItem),
    itens_venda_removidos: [],
  };
}

async function restaurarArquivoRegistro(id) {
  assertAdministrador();
  const registro = await getArquivoRegistro(id);
  if (!registro) throw new Error('Registro do arquivo não encontrado.');

  const vendas = require('./vendas');
  const encomendas = require('./encomendas');
  const db = getPool();

  if (registro.tipo_entidade === 'venda') {
    const payload = vendaSnapshotToSavePayload(registro.dados);
    if (registro.motivo === 'exclusao') {
      const criada = await vendas.salvarVenda(payload, null);
      return {
        tipo: 'venda',
        acao: 'recriada',
        id: criada.id,
        numero: criada.numero,
        mensagem: `Venda recriada como ${criada.numero}.`,
      };
    }

    const existe = await db.query('SELECT id FROM vendas WHERE id = $1', [registro.entidade_id]);
    if (existe.rowCount === 0) {
      const criada = await vendas.salvarVenda(payload, null);
      return {
        tipo: 'venda',
        acao: 'recriada',
        id: criada.id,
        numero: criada.numero,
        mensagem: `O pedido original não existia mais. Versão restaurada como nova venda ${criada.numero}.`,
      };
    }

    const restaurada = await vendas.salvarVenda(payload, registro.entidade_id);
    return {
      tipo: 'venda',
      acao: 'restaurada',
      id: restaurada.id,
      numero: restaurada.numero,
      mensagem: `Venda ${restaurada.numero} restaurada para a versão de ${new Date(registro.criado_em).toLocaleString('pt-BR')}.`,
    };
  }

  if (registro.tipo_entidade === 'encomenda_fornecedor') {
    const payload = encomendaSnapshotToSavePayload(registro.dados);
    if (registro.motivo === 'exclusao') {
      payload.itens = payload.itens.map(({ id: _id, ...rest }) => rest);
      payload.itens_venda = payload.itens_venda.map(({ id: _id, ...rest }) => rest);
      const criada = await encomendas.salvarEncomendaFornecedor(payload, null);
      return {
        tipo: 'encomenda_fornecedor',
        acao: 'recriada',
        id: criada.id,
        numero: criada.numero,
        mensagem: `Encomenda recriada como ${criada.numero}.`,
      };
    }

    const existe = await db.query(
      'SELECT id FROM encomendas_fornecedor WHERE id = $1',
      [registro.entidade_id]
    );
    if (existe.rowCount === 0) {
      payload.itens = payload.itens.map(({ id: _id, ...rest }) => rest);
      payload.itens_venda = payload.itens_venda.map(({ id: _id, ...rest }) => rest);
      const criada = await encomendas.salvarEncomendaFornecedor(payload, null);
      return {
        tipo: 'encomenda_fornecedor',
        acao: 'recriada',
        id: criada.id,
        numero: criada.numero,
        mensagem: `A encomenda original não existia mais. Versão restaurada como ${criada.numero}.`,
      };
    }

    const restaurada = await encomendas.salvarEncomendaFornecedor(payload, registro.entidade_id);
    return {
      tipo: 'encomenda_fornecedor',
      acao: 'restaurada',
      id: restaurada.id,
      numero: restaurada.numero,
      mensagem: `Encomenda ${restaurada.numero} restaurada para a versão de ${new Date(registro.criado_em).toLocaleString('pt-BR')}.`,
    };
  }

  throw new Error('Tipo de registro não suportado para restauração.');
}

module.exports = {
  assertAdministrador,
  registrarExclusao,
  registrarAlteracao,
  listArquivoRegistros,
  getArquivoRegistro,
  restaurarArquivoRegistro,
};
