const { getPool } = require('./database');

async function listRecebimentosParaEtiquetas(busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT
      r.id AS recebimento_id,
      r.criado_em AS data_recebimento,
      r.quantidade,
      ei.produto_id,
      p.sku,
      p.nome AS produto_nome,
      p.preco_venda,
      p.material,
      p.cor,
      p.largura_cm,
      p.altura_cm,
      p.profundidade_cm,
      ef.numero AS encomenda_numero,
      f.nome AS fornecedor_nome
    FROM recebimento_encomenda_itens r
    JOIN encomenda_fornecedor_itens ei ON ei.id = r.encomenda_item_id
    JOIN produtos p ON p.id = ei.produto_id
    JOIN encomendas_fornecedor ef ON ef.id = ei.encomenda_id
    JOIN fornecedores f ON f.id = ef.fornecedor_id
    WHERE COALESCE(r.estornado, false) = false
      AND COALESCE(p.ativo, true) = true
      AND (
        $1 = ''
        OR p.nome ILIKE $1
        OR p.sku ILIKE $1
        OR ef.numero ILIKE $1
        OR f.nome ILIKE $1
      )
    ORDER BY r.criado_em DESC
    LIMIT 200
  `, [termo]);
  return result.rows;
}

module.exports = {
  listRecebimentosParaEtiquetas,
};
