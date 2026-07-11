function groupItensPorAmbiente(ambientes, itens, ambienteIdField = 'ambiente_id') {
  const mapa = new Map(ambientes.map((a) => [a.id, []]));
  for (const item of itens) {
    const lista = mapa.get(item[ambienteIdField]);
    if (lista) lista.push(item);
  }
  return ambientes.map((ambiente) => ({
    ...ambiente,
    itens: mapa.get(ambiente.id) || [],
  }));
}

async function loadVendaAmbientesComItens(db, vendaId) {
  const [ambientesResult, itensResult] = await Promise.all([
    db.query(`
      SELECT * FROM venda_ambientes
      WHERE venda_id = $1
      ORDER BY ordem, id
    `, [vendaId]),
    db.query(`
      SELECT vi.*, p.sku AS produto_sku, p.foto_path AS produto_foto_path
      FROM venda_itens vi
      LEFT JOIN produtos p ON p.id = vi.produto_id
      WHERE vi.venda_id = $1
      ORDER BY vi.ordem, vi.id
    `, [vendaId]),
  ]);
  return groupItensPorAmbiente(ambientesResult.rows, itensResult.rows);
}

async function loadOrcamentoAmbientesComItens(db, orcamentoId) {
  const [ambientesResult, itensResult] = await Promise.all([
    db.query(`
      SELECT * FROM orcamento_ambientes
      WHERE orcamento_id = $1
      ORDER BY ordem, id
    `, [orcamentoId]),
    db.query(`
      SELECT oi.*, p.sku AS produto_sku, p.foto_path AS produto_foto_path
      FROM orcamento_itens oi
      LEFT JOIN produtos p ON p.id = oi.produto_id
      WHERE oi.orcamento_id = $1
      ORDER BY oi.ordem, oi.id
    `, [orcamentoId]),
  ]);
  return groupItensPorAmbiente(ambientesResult.rows, itensResult.rows);
}

async function loadVendaPlanejadoAmbientesComItens(db, vendaPlanejadoId) {
  const [ambientesResult, itensResult] = await Promise.all([
    db.query(`
      SELECT * FROM venda_planejado_ambientes
      WHERE venda_planejado_id = $1
      ORDER BY ordem, id
    `, [vendaPlanejadoId]),
    db.query(`
      SELECT * FROM venda_planejado_itens
      WHERE venda_planejado_id = $1
      ORDER BY ordem, id
    `, [vendaPlanejadoId]),
  ]);
  return groupItensPorAmbiente(ambientesResult.rows, itensResult.rows);
}

module.exports = {
  loadVendaAmbientesComItens,
  loadOrcamentoAmbientesComItens,
  loadVendaPlanejadoAmbientesComItens,
};
