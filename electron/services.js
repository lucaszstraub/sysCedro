const { getPool } = require('./database');
const images = require('./images');
const { getCached, TTL, invalidate } = require('./referenceCache');

const CODIGO_LOCALIZACAO_NAO_ALOCADOS = 'NAO-ALOC';

async function obterLocalizacaoNaoAlocados(client) {
  const db = client || getPool();
  const existing = await db.query(
    'SELECT id FROM localizacoes WHERE codigo = $1 AND ativo = true',
    [CODIGO_LOCALIZACAO_NAO_ALOCADOS]
  );
  if (existing.rowCount > 0) return existing.rows[0].id;

  const inserted = await db.query(`
    INSERT INTO localizacoes (codigo, nome, corredor, prateleira, capacidade, ativo)
    VALUES ($1, 'Não alocados', 'NAO', '00', 99999, true)
    RETURNING id
  `, [CODIGO_LOCALIZACAO_NAO_ALOCADOS]);
  return inserted.rows[0].id;
}

async function assertDestinoNaoEhNaoAlocados(client, localizacaoDestinoId) {
  if (!localizacaoDestinoId) return;
  const naoAlocadosId = await obterLocalizacaoNaoAlocados(client);
  if (Number(localizacaoDestinoId) === Number(naoAlocadosId)) {
    throw new Error(
      'Produtos só entram em "Não alocados" pelo recebimento de encomendas. Selecione uma localização definitiva.'
    );
  }
}

async function getDashboard() {
  const db = getPool();
  const [produtos, estoqueBaixo, movimentacoes, estoqueTotal, pendenciasAlocacao] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS total FROM produtos WHERE ativo = true'),
    db.query(`
      SELECT p.id, p.sku, p.nome, COALESCE(SUM(e.quantidade), 0)::int AS quantidade, p.estoque_minimo
      FROM produtos p
      LEFT JOIN estoque e ON e.produto_id = p.id
      WHERE p.ativo = true
      GROUP BY p.id
      HAVING COALESCE(SUM(e.quantidade), 0) <= p.estoque_minimo
      ORDER BY quantidade ASC
      LIMIT 10
    `),
    db.query(`
      SELECT m.id, m.tipo, m.quantidade, m.criado_em, p.nome AS produto_nome
      FROM movimentacoes m
      JOIN produtos p ON p.id = m.produto_id
      ORDER BY m.criado_em DESC
      LIMIT 8
    `),
    db.query('SELECT COALESCE(SUM(quantidade), 0)::int AS total FROM estoque'),
    db.query(`
      SELECT
        COUNT(DISTINCT e.produto_id)::int AS produtos,
        COALESCE(SUM(e.quantidade), 0)::int AS unidades
      FROM estoque e
      JOIN localizacoes l ON l.id = e.localizacao_id
      WHERE l.codigo = $1 AND e.quantidade > 0
    `, [CODIGO_LOCALIZACAO_NAO_ALOCADOS]),
  ]);

  const categorias = await db.query(`
    SELECT c.nome, COUNT(p.id)::int AS total
    FROM categorias c
    LEFT JOIN produtos p ON p.categoria_id = c.id AND p.ativo = true
    GROUP BY c.id
    ORDER BY total DESC
  `);

  return {
    totalProdutos: produtos.rows[0].total,
    totalItensEstoque: estoqueTotal.rows[0].total,
    estoqueBaixo: estoqueBaixo.rows,
    movimentacoesRecentes: movimentacoes.rows,
    produtosPorCategoria: categorias.rows,
    pendenciasAlocacao: {
      produtos: pendenciasAlocacao.rows[0]?.produtos || 0,
      unidades: pendenciasAlocacao.rows[0]?.unidades || 0,
    },
  };
}

async function listCategorias() {
  return getCached('ref:categorias', TTL.MEDIUM, async () => {
    const db = getPool();
    const result = await db.query('SELECT * FROM categorias ORDER BY nome');
    return result.rows;
  });
}

async function listLocalizacoes() {
  return getCached('ref:localizacoes', TTL.MEDIUM, async () => {
    const db = getPool();
    const result = await db.query('SELECT * FROM localizacoes WHERE ativo = true ORDER BY codigo');
    return result.rows;
  });
}

async function listProdutos(busca = '') {
  const db = getPool();
  const result = await db.query(`
    SELECT p.*, c.nome AS categoria_nome, f.nome AS fornecedor_nome,
           COALESCE(SUM(e.quantidade), 0)::int AS quantidade_total
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
    LEFT JOIN estoque e ON e.produto_id = p.id
    WHERE p.ativo = true
      AND ($1 = '' OR p.nome ILIKE $1 OR p.sku ILIKE $1
           OR p.material ILIKE $1 OR p.cor ILIKE $1
           OR c.nome ILIKE $1 OR f.nome ILIKE $1)
    GROUP BY p.id, c.nome, f.nome
    ORDER BY p.nome
  `, [`%${busca}%`]);
  return result.rows;
}

async function getProduto(id) {
  const db = getPool();
  const result = await db.query(`
    SELECT p.*, c.nome AS categoria_nome, f.nome AS fornecedor_nome
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
    WHERE p.id = $1
  `, [id]);
  return result.rows[0];
}

const PREFIXOS_CATEGORIA = {
  'Sofás': 'SOF',
  'Mesas': 'MES',
  'Cadeiras': 'CAD',
  'Camas': 'CAM',
  'Armários': 'ARM',
  'Estantes': 'EST',
  'Decoração': 'DEC',
};

function categoriaParaPrefixo(nome) {
  if (PREFIXOS_CATEGORIA[nome]) return PREFIXOS_CATEGORIA[nome];
  const limpo = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
  return (limpo.substring(0, 3).toUpperCase() || 'PRD');
}

async function gerarSku(categoriaId) {
  const db = getPool();
  let prefix = 'PRD';

  if (categoriaId) {
    const cat = await db.query('SELECT nome FROM categorias WHERE id = $1', [categoriaId]);
    if (cat.rows[0]) prefix = categoriaParaPrefixo(cat.rows[0].nome);
  }

  const result = await db.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(sku, '^.*-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM produtos
    WHERE sku LIKE $1
  `, [`${prefix}-%`]);

  const numero = String(result.rows[0].proximo).padStart(3, '0');
  return `${prefix}-${numero}`;
}

async function createProduto(data) {
  const db = getPool();
  const { fotoBase64, removerFoto, ...produtoData } = data;
  const sku = await gerarSku(produtoData.categoria_id || null);
  const result = await db.query(`
    INSERT INTO produtos (sku, nome, categoria_id, fornecedor_id, descricao, material, cor,
      largura_cm, altura_cm, profundidade_cm, peso_kg, preco_custo, preco_venda, estoque_minimo, volumes_por_unidade)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *
  `, [
    sku, produtoData.nome, produtoData.categoria_id || null, produtoData.fornecedor_id || null,
    produtoData.descricao || null, produtoData.material || null, produtoData.cor || null,
    produtoData.largura_cm || null, produtoData.altura_cm || null, produtoData.profundidade_cm || null,
    produtoData.peso_kg || null, produtoData.preco_custo || 0, produtoData.preco_venda || 0, produtoData.estoque_minimo || 0,
    Math.max(1, Number(produtoData.volumes_por_unidade) || 1),
  ]);

  let produto = result.rows[0];

  if (fotoBase64) {
    const fotoPath = await images.salvarFotoProduto(produto.id, fotoBase64);
    const updated = await db.query(
      'UPDATE produtos SET foto_path = $1 WHERE id = $2 RETURNING *',
      [fotoPath, produto.id]
    );
    produto = updated.rows[0];
  }

  return produto;
}

async function updateProduto(id, data) {
  const db = getPool();
  const { fotoBase64, removerFoto, ...produtoData } = data;
  const current = await db.query('SELECT foto_path FROM produtos WHERE id = $1', [id]);
  const fotoAtual = current.rows[0]?.foto_path || null;

  const result = await db.query(`
    UPDATE produtos SET
      nome = $2, categoria_id = $3, fornecedor_id = $4, descricao = $5,
      material = $6, cor = $7, largura_cm = $8, altura_cm = $9, profundidade_cm = $10,
      peso_kg = $11, preco_custo = $12, preco_venda = $13, estoque_minimo = $14,
      volumes_por_unidade = $15,
      atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id, produtoData.nome, produtoData.categoria_id || null, produtoData.fornecedor_id || null,
    produtoData.descricao || null, produtoData.material || null, produtoData.cor || null,
    produtoData.largura_cm || null, produtoData.altura_cm || null, produtoData.profundidade_cm || null,
    produtoData.peso_kg || null, produtoData.preco_custo || 0, produtoData.preco_venda || 0, produtoData.estoque_minimo || 0,
    Math.max(1, Number(produtoData.volumes_por_unidade) || 1),
  ]);

  let produto = result.rows[0];

  if (removerFoto && fotoAtual) {
    await images.removerFotoProduto(fotoAtual);
    const updated = await db.query(
      'UPDATE produtos SET foto_path = NULL WHERE id = $1 RETURNING *',
      [id]
    );
    produto = updated.rows[0];
  } else if (fotoBase64) {
    if (fotoAtual) await images.removerFotoProduto(fotoAtual);
    const fotoPath = await images.salvarFotoProduto(id, fotoBase64);
    const updated = await db.query(
      'UPDATE produtos SET foto_path = $1 WHERE id = $2 RETURNING *',
      [fotoPath, id]
    );
    produto = updated.rows[0];
  }

  return produto;
}

async function getProdutoFoto(id) {
  const db = getPool();
  const result = await db.query('SELECT foto_path FROM produtos WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new Error('Produto não encontrado.');
  return images.getProdutoFotoDataUrl(result.rows[0].foto_path);
}

async function deleteProduto(id) {
  const db = getPool();
  await db.query('UPDATE produtos SET ativo = false WHERE id = $1', [id]);
  return { success: true };
}

async function listEstoque(busca = '') {
  const db = getPool();
  const result = await db.query(`
    SELECT e.id, e.quantidade, e.atualizado_em,
           p.id AS produto_id, p.sku, p.nome AS produto_nome, p.estoque_minimo,
           l.id AS localizacao_id, l.codigo AS localizacao_codigo, l.nome AS localizacao_nome
    FROM estoque e
    JOIN produtos p ON p.id = e.produto_id
    JOIN localizacoes l ON l.id = e.localizacao_id
    WHERE p.ativo = true
      AND ($1 = '' OR p.nome ILIKE $1 OR p.sku ILIKE $1 OR l.codigo ILIKE $1)
    ORDER BY p.nome, l.codigo
  `, [`%${busca}%`]);
  return result.rows;
}

async function listPendenciasAlocacao(busca = '') {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT
      e.id AS estoque_id,
      e.quantidade,
      e.atualizado_em,
      p.id AS produto_id,
      p.sku,
      p.nome AS produto_nome,
      l.id AS localizacao_id,
      l.codigo AS localizacao_codigo,
      l.nome AS localizacao_nome,
      (
        SELECT MAX(m.criado_em)
        FROM movimentacoes m
        WHERE m.produto_id = e.produto_id
          AND m.localizacao_destino_id = l.id
          AND m.referencia_tipo = 'encomenda_recebimento'
      ) AS ultimo_recebimento_em
    FROM estoque e
    JOIN produtos p ON p.id = e.produto_id
    JOIN localizacoes l ON l.id = e.localizacao_id
    WHERE l.codigo = $2
      AND e.quantidade > 0
      AND p.ativo = true
      AND ($1 = '' OR p.nome ILIKE $1 OR p.sku ILIKE $1)
    ORDER BY COALESCE(
      (
        SELECT MAX(m.criado_em)
        FROM movimentacoes m
        WHERE m.produto_id = e.produto_id
          AND m.localizacao_destino_id = l.id
          AND m.referencia_tipo = 'encomenda_recebimento'
      ),
      e.atualizado_em
    ) ASC
  `, [termo, CODIGO_LOCALIZACAO_NAO_ALOCADOS]);
  return result.rows;
}

async function alocarProduto(data) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const naoAlocadosId = await obterLocalizacaoNaoAlocados(client);
    const destinoId = Number(data.localizacao_destino_id);
    const produtoId = Number(data.produto_id);
    const qty = Number(data.quantidade);

    if (!produtoId) throw new Error('Produto inválido.');
    if (!destinoId) throw new Error('Selecione a localização de destino.');
    if (destinoId === naoAlocadosId) {
      throw new Error('Selecione uma localização definitiva para guardar o produto.');
    }
    if (!qty || qty <= 0) throw new Error('Informe a quantidade a alocar.');

    await reduzirEstoque(client, produtoId, naoAlocadosId, qty);
    await upsertEstoque(client, produtoId, destinoId, qty);

    const mov = await client.query(`
      INSERT INTO movimentacoes (
        produto_id, localizacao_origem_id, localizacao_destino_id,
        tipo, quantidade, motivo, usuario, referencia_tipo
      )
      VALUES ($1, $2, $3, 'transferencia', $4, $5, $6, 'alocacao')
      RETURNING *
    `, [
      produtoId,
      naoAlocadosId,
      destinoId,
      qty,
      data.motivo || 'Alocação de produto recebido',
      data.usuario || 'operador',
    ]);

    await client.query('COMMIT');
    return mov.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listMovimentacoes(limite = 50) {
  const db = getPool();
  const result = await db.query(`
    SELECT m.*, p.sku, p.nome AS produto_nome,
           lo.codigo AS origem_codigo, lo.nome AS origem_nome,
           ld.codigo AS destino_codigo, ld.nome AS destino_nome
    FROM movimentacoes m
    JOIN produtos p ON p.id = m.produto_id
    LEFT JOIN localizacoes lo ON lo.id = m.localizacao_origem_id
    LEFT JOIN localizacoes ld ON ld.id = m.localizacao_destino_id
    ORDER BY m.criado_em DESC
    LIMIT $1
  `, [limite]);
  return result.rows;
}

async function registrarMovimentacao(data) {
  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { produto_id, tipo, quantidade, localizacao_origem_id, localizacao_destino_id, motivo, usuario } = data;

    if (tipo === 'entrada') {
      if (!localizacao_destino_id) throw new Error('Localização de destino é obrigatória para entrada.');
      await assertDestinoNaoEhNaoAlocados(client, localizacao_destino_id);
      await upsertEstoque(client, produto_id, localizacao_destino_id, quantidade);
    } else if (tipo === 'saida') {
      if (!localizacao_origem_id) throw new Error('Localização de origem é obrigatória para saída.');
      await reduzirEstoque(client, produto_id, localizacao_origem_id, quantidade);
    } else if (tipo === 'transferencia') {
      if (!localizacao_origem_id || !localizacao_destino_id) {
        throw new Error('Origem e destino são obrigatórios para transferência.');
      }
      await assertDestinoNaoEhNaoAlocados(client, localizacao_destino_id);
      await reduzirEstoque(client, produto_id, localizacao_origem_id, quantidade);
      await upsertEstoque(client, produto_id, localizacao_destino_id, quantidade);
    } else if (tipo === 'ajuste') {
      if (!localizacao_destino_id) throw new Error('Localização é obrigatória para ajuste.');
      await assertDestinoNaoEhNaoAlocados(client, localizacao_destino_id);
      await ajustarEstoque(client, produto_id, localizacao_destino_id, quantidade);
    } else {
      throw new Error('Tipo de movimentação inválido.');
    }

    const mov = await client.query(`
      INSERT INTO movimentacoes (produto_id, localizacao_origem_id, localizacao_destino_id, tipo, quantidade, motivo, usuario)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [produto_id, localizacao_origem_id || null, localizacao_destino_id || null, tipo, quantidade, motivo || null, usuario || 'operador']);

    await client.query('COMMIT');
    return mov.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function upsertEstoque(client, produtoId, localizacaoId, quantidade) {
  await client.query(`
    INSERT INTO estoque (produto_id, localizacao_id, quantidade)
    VALUES ($1, $2, $3)
    ON CONFLICT (produto_id, localizacao_id)
    DO UPDATE SET quantidade = estoque.quantidade + $3, atualizado_em = NOW()
  `, [produtoId, localizacaoId, quantidade]);
}

async function reduzirEstoque(client, produtoId, localizacaoId, quantidade) {
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

async function ajustarEstoque(client, produtoId, localizacaoId, quantidade) {
  await client.query(`
    INSERT INTO estoque (produto_id, localizacao_id, quantidade)
    VALUES ($1, $2, $3)
    ON CONFLICT (produto_id, localizacao_id)
    DO UPDATE SET quantidade = $3, atualizado_em = NOW()
  `, [produtoId, localizacaoId, quantidade]);
}

async function createLocalizacao(data) {
  const db = getPool();
  const codigo = String(data.codigo || '').trim();
  if (!codigo) throw new Error('Informe o código da localização.');

  const dup = await db.query(
    'SELECT 1 FROM localizacoes WHERE codigo = $1 AND ativo = true',
    [codigo]
  );
  if (dup.rowCount > 0) throw new Error('Já existe uma localização com este código.');

  const result = await db.query(`
    INSERT INTO localizacoes (codigo, nome, corredor, prateleira, capacidade)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [codigo, data.nome, data.corredor || null, data.prateleira || null, data.capacidade || 0]);
  invalidate('ref:localizacoes');
  return result.rows[0];
}

async function updateLocalizacao(id, data) {
  const db = getPool();
  const existing = await db.query(
    'SELECT * FROM localizacoes WHERE id = $1 AND ativo = true',
    [id]
  );
  if (existing.rowCount === 0) throw new Error('Localização não encontrada.');
  const loc = existing.rows[0];

  const codigo = String(data.codigo || '').trim();
  if (!codigo) throw new Error('Informe o código da localização.');
  if (!String(data.nome || '').trim()) throw new Error('Informe o nome da localização.');

  if (loc.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS && codigo !== loc.codigo) {
    throw new Error('O código da área "Não alocados" não pode ser alterado.');
  }

  if (codigo !== loc.codigo) {
    const dup = await db.query(
      'SELECT 1 FROM localizacoes WHERE codigo = $1 AND id != $2 AND ativo = true',
      [codigo, id]
    );
    if (dup.rowCount > 0) throw new Error('Já existe uma localização com este código.');
  }

  const result = await db.query(`
    UPDATE localizacoes SET
      codigo = $2,
      nome = $3,
      corredor = $4,
      prateleira = $5,
      capacidade = $6
    WHERE id = $1 AND ativo = true
    RETURNING *
  `, [
    id,
    codigo,
    String(data.nome).trim(),
    data.corredor || null,
    data.prateleira || null,
    Number(data.capacidade) || 0,
  ]);
  invalidate('ref:localizacoes');
  return result.rows[0];
}

async function deleteLocalizacao(id) {
  const db = getPool();
  const existing = await db.query(
    'SELECT * FROM localizacoes WHERE id = $1 AND ativo = true',
    [id]
  );
  if (existing.rowCount === 0) throw new Error('Localização não encontrada.');
  const loc = existing.rows[0];

  if (loc.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS) {
    throw new Error('A área "Não alocados" é do sistema e não pode ser excluída.');
  }

  const estoque = await db.query(
    'SELECT COALESCE(SUM(quantidade), 0)::int AS total FROM estoque WHERE localizacao_id = $1',
    [id]
  );
  if (Number(estoque.rows[0]?.total) > 0) {
    throw new Error(
      'Não é possível excluir: há produtos nesta localização. Transfira o estoque antes.'
    );
  }

  await db.query('UPDATE localizacoes SET ativo = false WHERE id = $1', [id]);
  invalidate('ref:localizacoes');
  return { success: true };
}

module.exports = {
  getDashboard,
  listCategorias,
  listLocalizacoes,
  listProdutos,
  getProduto,
  createProduto,
  updateProduto,
  deleteProduto,
  listEstoque,
  listPendenciasAlocacao,
  alocarProduto,
  listMovimentacoes,
  registrarMovimentacao,
  createLocalizacao,
  updateLocalizacao,
  deleteLocalizacao,
  getProdutoFoto,
};
