function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatCurrency(value) {
  return round2(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('pt-BR');
}

function formatValor(campo, valor) {
  if (valor == null || valor === '') return '—';
  if (campo.includes('custo') || campo.includes('preco') || campo.includes('total') || campo.includes('valor')) {
    return formatCurrency(valor);
  }
  if (campo.includes('data') || campo.includes('previsao_entrega')) {
    return formatDate(valor);
  }
  if (campo.includes('percentual') || campo === 'frete_percentual' || campo === 'ipi_percentual') {
    return `${round2(valor)}%`;
  }
  return String(valor);
}

function pushAlteracao(alteracoes, texto) {
  if (texto) alteracoes.push(texto);
}

function compararCampo(alteracoes, rotulo, campo, anterior, novo, contexto = '') {
  const a = anterior == null || anterior === '' ? null : anterior;
  const b = novo == null || novo === '' ? null : novo;
  if (String(a ?? '') === String(b ?? '')) return;
  const prefixo = contexto ? `${contexto}: ` : '';
  pushAlteracao(
    alteracoes,
    `${prefixo}${rotulo} alterou de ${formatValor(campo, a)} para ${formatValor(campo, b)}`
  );
}

function itemVendaKey(item, ambienteNome) {
  return `${(ambienteNome || '').trim().toLowerCase()}::${item.produto_id || ''}::${(item.descricao || '').trim().toLowerCase()}`;
}

function flattenItensVenda(dados) {
  const map = new Map();
  for (const ambiente of dados.ambientes || []) {
    for (const item of ambiente.itens || []) {
      map.set(itemVendaKey(item, ambiente.nome), { item, ambiente: ambiente.nome });
    }
  }
  return map;
}

function itemEncomendaKey(item) {
  if (item.id) return `id:${item.id}`;
  return `p:${item.produto_id || ''}:v:${item.venda_item_id || ''}`;
}

function mapItensEncomenda(dados) {
  const map = new Map();
  for (const item of dados.itens || []) {
    map.set(itemEncomendaKey(item), item);
  }
  return map;
}

function compararVendas(anterior, novo) {
  const alteracoes = [];

  compararCampo(alteracoes, 'Cliente', 'cliente', anterior.cliente_nome, novo.cliente_nome);
  compararCampo(alteracoes, 'Vendedor', 'vendedor', anterior.vendedor_nome, novo.vendedor_nome);
  compararCampo(alteracoes, 'Nº do pedido', 'numero_pedido', anterior.numero_pedido, novo.numero_pedido);
  compararCampo(alteracoes, 'Total pago', 'total_pago', anterior.total_pago, novo.total_pago);
  compararCampo(alteracoes, 'Subtotal', 'subtotal', anterior.subtotal, novo.subtotal);
  compararCampo(alteracoes, 'Observações', 'observacoes', anterior.observacoes, novo.observacoes);

  const pagAnt = (anterior.pagamentos || []).map((p) => `${p.forma_nome || p.tipo}:${p.valor}`).join('|');
  const pagNov = (novo.pagamentos || []).map((p) => `${p.forma_nome || p.tipo}:${p.valor}`).join('|');
  if (pagAnt !== pagNov) {
    pushAlteracao(alteracoes, 'Formas de pagamento foram alteradas');
  }

  const itensAnt = flattenItensVenda(anterior);
  const itensNov = flattenItensVenda(novo);

  for (const [key, { item, ambiente }] of itensAnt) {
    if (!itensNov.has(key)) {
      pushAlteracao(
        alteracoes,
        `Item removido (${ambiente}): ${item.descricao}`
      );
    }
  }

  for (const [key, { item, ambiente }] of itensNov) {
    const ctx = `Item "${item.descricao}" (${ambiente})`;
    if (!itensAnt.has(key)) {
      pushAlteracao(alteracoes, `${ctx} foi adicionado`);
      continue;
    }
    const ant = itensAnt.get(key).item;
    compararCampo(alteracoes, 'Quantidade', 'quantidade', ant.quantidade, item.quantidade, ctx);
    compararCampo(alteracoes, 'Qtd. estoque', 'quantidade_estoque', ant.quantidade_estoque, item.quantidade_estoque, ctx);
    compararCampo(alteracoes, 'Qtd. encomenda', 'quantidade_encomenda', ant.quantidade_encomenda, item.quantidade_encomenda, ctx);
    compararCampo(alteracoes, 'Preço unitário', 'preco_unitario', ant.preco_unitario, item.preco_unitario, ctx);
    compararCampo(alteracoes, 'Preço de tabela', 'preco_unitario_lista', ant.preco_unitario_lista, item.preco_unitario_lista, ctx);
    compararCampo(alteracoes, 'Custo de estoque', 'custo_estoque_unitario', ant.custo_estoque_unitario, item.custo_estoque_unitario, ctx);
    compararCampo(alteracoes, 'Custo de encomenda', 'custo_encomenda_unitario', ant.custo_encomenda_unitario, item.custo_encomenda_unitario, ctx);
  }

  const ambientesAnt = (anterior.ambientes || []).map((a) => a.nome).join('|');
  const ambientesNov = (novo.ambientes || []).map((a) => a.nome).join('|');
  if (ambientesAnt !== ambientesNov) {
    pushAlteracao(alteracoes, 'Ambientes do pedido foram reorganizados');
  }

  return alteracoes;
}

function compararEncomendas(anterior, novo) {
  const alteracoes = [];

  compararCampo(alteracoes, 'Fornecedor', 'fornecedor', anterior.fornecedor_nome, novo.fornecedor_nome);
  compararCampo(alteracoes, 'Status', 'status', anterior.status, novo.status);
  compararCampo(alteracoes, 'Data do pedido', 'data_pedido', anterior.data_pedido, novo.data_pedido);
  compararCampo(alteracoes, 'Previsão de entrega', 'previsao_entrega', anterior.previsao_entrega, novo.previsao_entrega);
  compararCampo(alteracoes, 'Frete (%)', 'frete_percentual', anterior.frete_percentual, novo.frete_percentual);
  compararCampo(alteracoes, 'IPI (%)', 'ipi_percentual', anterior.ipi_percentual, novo.ipi_percentual);
  compararCampo(alteracoes, 'Observações', 'observacoes', anterior.observacoes, novo.observacoes);

  const itensAnt = mapItensEncomenda(anterior);
  const itensNov = mapItensEncomenda(novo);

  for (const [key, item] of itensAnt) {
    if (!itensNov.has(key)) {
      const nome = item.produto_nome || item.item_venda_descricao || item.produto_sku || 'Produto';
      pushAlteracao(alteracoes, `Item removido: ${nome}`);
    }
  }

  for (const [key, item] of itensNov) {
    const nome = item.produto_nome || item.item_venda_descricao || item.produto_sku || 'Produto';
    const ctx = `Produto "${nome}"`;
    if (!itensAnt.has(key)) {
      pushAlteracao(alteracoes, `${ctx} foi adicionado`);
      continue;
    }
    const ant = itensAnt.get(key);
    compararCampo(alteracoes, 'Quantidade pedida', 'quantidade_pedida', ant.quantidade_pedida, item.quantidade_pedida, ctx);
    compararCampo(alteracoes, 'Custo negociado', 'custo_negociado', ant.custo_negociado, item.custo_negociado, ctx);
    compararCampo(alteracoes, 'Custo com impostos', 'custo_com_impostos', ant.custo_com_impostos, item.custo_com_impostos, ctx);
    compararCampo(alteracoes, 'Previsão de entrega', 'previsao_entrega', ant.previsao_entrega, item.previsao_entrega, ctx);
  }

  return alteracoes;
}

function compararSnapshots(tipoEntidade, anterior, novo) {
  if (!anterior || !novo) return [];
  if (tipoEntidade === 'venda') return compararVendas(anterior, novo);
  if (tipoEntidade === 'encomenda_fornecedor') return compararEncomendas(anterior, novo);
  return [];
}

function buildPreviewVenda(dados) {
  const ambientes = (dados.ambientes || []).map((ambiente) => ({
    nome: ambiente.nome || 'Ambiente',
    itens: (ambiente.itens || []).map((item) => ({
      descricao: item.descricao,
      sku: item.produto_sku || null,
      quantidade: Number(item.quantidade) || 0,
      quantidade_estoque: Number(item.quantidade_estoque) || 0,
      quantidade_encomenda: Number(item.quantidade_encomenda) || 0,
      preco_unitario: round2(item.preco_unitario),
      preco_lista: item.preco_unitario_lista != null ? round2(item.preco_unitario_lista) : null,
      subtotal: round2((Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0)),
      custo_estoque: item.custo_estoque_unitario != null ? round2(item.custo_estoque_unitario) : null,
      custo_encomenda: item.custo_encomenda_unitario != null ? round2(item.custo_encomenda_unitario) : null,
    })),
  }));

  const totalItens = ambientes.reduce((acc, a) => acc + a.itens.length, 0);

  return {
    tipo: 'venda',
    cabecalho: {
      numero: dados.numero,
      numero_pedido: dados.numero_pedido,
      cliente_nome: dados.cliente_nome,
      vendedor_nome: dados.vendedor_nome,
      status: dados.status,
      total: round2(dados.total),
      total_pago: round2(dados.total_pago ?? dados.total),
      observacoes: dados.observacoes || null,
    },
    ambientes,
    pagamentos: (dados.pagamentos || []).map((p) => ({
      forma: p.forma_nome || p.tipo,
      valor: round2(p.valor),
      parcelas: Number(p.parcelas) || 1,
    })),
    total_itens: totalItens,
  };
}

function buildPreviewEncomenda(dados) {
  const itens = (dados.itens || []).map((item) => ({
    descricao: item.produto_nome || item.item_venda_descricao || item.produto_descricao || '—',
    sku: item.produto_sku || null,
    quantidade_pedida: Number(item.quantidade_pedida) || 0,
    custo_negociado: round2(item.custo_negociado),
    custo_com_impostos: round2(item.custo_com_impostos),
    destino: item.destino_esperado || (item.venda_item_id ? 'cliente' : 'estoque'),
    cliente_nome: item.cliente_nome || null,
    venda_numero: item.venda_numero || item.numero_pedido || null,
    previsao_entrega: item.previsao_entrega || null,
    status: item.status || null,
  }));

  return {
    tipo: 'encomenda_fornecedor',
    cabecalho: {
      numero: dados.numero,
      fornecedor_nome: dados.fornecedor_nome,
      status: dados.status,
      data_pedido: dados.data_pedido,
      previsao_entrega: dados.previsao_entrega,
      frete_percentual: dados.frete_percentual,
      ipi_percentual: dados.ipi_percentual,
      observacoes: dados.observacoes || null,
    },
    itens,
    total_itens: itens.length,
  };
}

function buildPreview(tipoEntidade, dados) {
  if (!dados) return null;
  if (tipoEntidade === 'venda') return buildPreviewVenda(dados);
  if (tipoEntidade === 'encomenda_fornecedor') return buildPreviewEncomenda(dados);
  return null;
}

function resumoFromAlteracoes(alteracoes, motivo, tipoEntidade, preview) {
  if (motivo === 'alteracao' && alteracoes.length > 0) {
    if (alteracoes.length === 1) return alteracoes[0];
    return `${alteracoes.length} alterações: ${alteracoes[0]}`;
  }

  if (motivo === 'exclusao') {
    const tipo = tipoEntidade === 'venda' ? 'Venda excluída' : 'Encomenda excluída';
    const qtd = preview?.total_itens ?? 0;
    const ref = preview?.cabecalho?.numero_pedido
      || preview?.cabecalho?.numero
      || '';
    const parte = preview?.tipo === 'venda'
      ? preview.cabecalho?.cliente_nome
      : preview.cabecalho?.fornecedor_nome;
    const total = preview?.cabecalho?.total_pago ?? preview?.cabecalho?.total;
    const partes = [tipo, ref, parte, `${qtd} item(ns)`];
    if (total != null) partes.push(formatCurrency(total));
    return partes.filter(Boolean).join(' · ');
  }

  if (motivo === 'alteracao') {
    return 'Versão anterior arquivada (sem detalhes das mudanças)';
  }

  return 'Registro arquivado';
}

function enriquecerRegistroArquivo(registro, estadoAtual = null) {
  const tipo = registro.tipo_entidade;
  const dados = registro.dados;
  let alteracoes = Array.isArray(registro.alteracoes) ? registro.alteracoes : [];
  let preview = registro.preview || null;

  if (!preview && dados) {
    preview = buildPreview(tipo, dados);
  }

  if (registro.motivo === 'alteracao' && alteracoes.length === 0 && dados && estadoAtual) {
    alteracoes = compararSnapshots(tipo, dados, estadoAtual);
  }

  const resumo = registro.resumo || resumoFromAlteracoes(alteracoes, registro.motivo, tipo, preview);

  return {
    ...registro,
    alteracoes,
    preview,
    resumo,
  };
}

module.exports = {
  compararSnapshots,
  buildPreview,
  resumoFromAlteracoes,
  enriquecerRegistroArquivo,
  formatCurrency,
};
