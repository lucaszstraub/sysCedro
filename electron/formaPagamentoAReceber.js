function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizarNomeFormaPagamento(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isFormaAReceber(nome) {
  return normalizarNomeFormaPagamento(nome) === 'a receber';
}

function parsePagamentosVenda(raw) {
  if (!raw) return [];
  const lista = Array.isArray(raw) ? raw : [];
  return lista
    .map((p) => ({
      forma_pagamento_id: p.forma_pagamento_id ? Number(p.forma_pagamento_id) : null,
      valor: Number(p.valor) || 0,
    }))
    .filter((p) => p.valor > 0);
}

async function getIdsFormaAReceber(db) {
  const result = await db.query('SELECT id, nome FROM formas_pagamento WHERE ativo = true');
  return result.rows.filter((row) => isFormaAReceber(row.nome)).map((row) => row.id);
}

async function calcularValorAReceberVenda(db, pagamentosRaw) {
  const idsAReceber = await getIdsFormaAReceber(db);
  if (!idsAReceber.length) return 0;

  const idSet = new Set(idsAReceber.map(Number));
  return round2(
    parsePagamentosVenda(pagamentosRaw)
      .filter((p) => p.forma_pagamento_id && idSet.has(p.forma_pagamento_id))
      .reduce((sum, p) => sum + p.valor, 0)
  );
}

async function calcularMapaAReceberPorVenda(db, vendaIds, idsAReceber) {
  if (!vendaIds.length || !idsAReceber.length) return {};

  const idSet = new Set(idsAReceber.map(Number));
  const result = await db.query(
    'SELECT id, pagamentos FROM vendas WHERE id = ANY($1::int[])',
    [vendaIds]
  );

  const mapa = {};
  for (const row of result.rows) {
    const valor = round2(
      parsePagamentosVenda(row.pagamentos)
        .filter((p) => p.forma_pagamento_id && idSet.has(p.forma_pagamento_id))
        .reduce((sum, p) => sum + p.valor, 0)
    );
    if (valor > 0) mapa[row.id] = valor;
  }
  return mapa;
}

module.exports = {
  isFormaAReceber,
  parsePagamentosVenda,
  getIdsFormaAReceber,
  calcularValorAReceberVenda,
  calcularMapaAReceberPorVenda,
};
