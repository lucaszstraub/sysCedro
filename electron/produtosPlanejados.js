const { getPool } = require('./database');

const TIPOS_FUNDO = ['vazado', 'grosso', 'fino', 'com_manta_isolante'];
const TIPOS_PORTA = ['sem_porta', 'porta_correr', 'porta_giro'];
const TIPOS_PUXADOR = ['sem_puxador', 'usinado', 'versatille', 'px_60', 'roma_8015', 'sier_recorte_45', 'outro'];
const TIPOS_CORREDICAS = ['sem_corredicas', 'padrao', 'invisiveis'];

function normalizarCamposPlanejado(data) {
  const tipoPuxador = TIPOS_PUXADOR.includes(data.tipo_puxador) ? data.tipo_puxador : 'sem_puxador';
  return {
    nome: (data.nome || '').trim(),
    largura: data.largura != null && data.largura !== '' ? Number(data.largura) : null,
    profundidade: data.profundidade != null && data.profundidade !== '' ? Number(data.profundidade) : null,
    altura: data.altura != null && data.altura !== '' ? Number(data.altura) : null,
    espessura_mdf: Number(data.espessura_mdf) || 18,
    padrao_mdf: (data.padrao_mdf || '').trim() || null,
    tipo_fundo: TIPOS_FUNDO.includes(data.tipo_fundo) ? data.tipo_fundo : 'fino',
    tipo_porta: TIPOS_PORTA.includes(data.tipo_porta) ? data.tipo_porta : 'sem_porta',
    tipo_puxador: tipoPuxador,
    tipo_puxador_outro: tipoPuxador === 'outro' ? ((data.tipo_puxador_outro || '').trim() || null) : null,
    cor_puxador: (data.cor_puxador || '').trim() || null,
    tipo_corredicas: TIPOS_CORREDICAS.includes(data.tipo_corredicas) ? data.tipo_corredicas : 'sem_corredicas',
    canaleta_led: Boolean(data.canaleta_led),
    itens_extra: (data.itens_extra || '').trim() || null,
    preco_unitario_sugerido: Number(data.preco_unitario_sugerido) || 0,
  };
}

function normalizarItemPlanejado(item) {
  const tipoPuxador = TIPOS_PUXADOR.includes(item.tipo_puxador) ? item.tipo_puxador : 'sem_puxador';
  return {
    descricao: (item.descricao || '').trim(),
    produto_planejado_id: item.produto_planejado_id ? Number(item.produto_planejado_id) : null,
    largura: item.largura != null && item.largura !== '' ? Number(item.largura) : null,
    profundidade: item.profundidade != null && item.profundidade !== '' ? Number(item.profundidade) : null,
    altura: item.altura != null && item.altura !== '' ? Number(item.altura) : null,
    espessura_mdf: Number(item.espessura_mdf) || 18,
    padrao_mdf: (item.padrao_mdf || '').trim() || null,
    tipo_fundo: TIPOS_FUNDO.includes(item.tipo_fundo) ? item.tipo_fundo : 'fino',
    tipo_porta: TIPOS_PORTA.includes(item.tipo_porta) ? item.tipo_porta : 'sem_porta',
    tipo_puxador: tipoPuxador,
    tipo_puxador_outro: tipoPuxador === 'outro' ? ((item.tipo_puxador_outro || '').trim() || null) : null,
    cor_puxador: (item.cor_puxador || '').trim() || null,
    tipo_corredicas: TIPOS_CORREDICAS.includes(item.tipo_corredicas) ? item.tipo_corredicas : 'sem_corredicas',
    canaleta_led: Boolean(item.canaleta_led),
    itens_extra: (item.itens_extra || '').trim() || null,
    quantidade: Number(item.quantidade) || 1,
    preco_unitario: Number(item.preco_unitario) || 0,
  };
}

async function listProdutosPlanejados(busca = '', { apenasAtivos = true } = {}) {
  const db = getPool();
  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT *
    FROM produtos_planejados
    WHERE ($1 = '' OR nome ILIKE $1)
      AND ($2 = false OR ativo = true)
    ORDER BY nome
  `, [termo, apenasAtivos]);
  return result.rows;
}

async function getProdutoPlanejado(id) {
  const db = getPool();
  const result = await db.query('SELECT * FROM produtos_planejados WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createProdutoPlanejado(data) {
  const db = getPool();
  const campos = normalizarCamposPlanejado(data);
  if (!campos.nome) throw new Error('Informe o nome do tipo de móvel.');

  const result = await db.query(`
    INSERT INTO produtos_planejados (
      nome, largura, profundidade, altura, espessura_mdf, padrao_mdf,
      tipo_fundo, tipo_porta, tipo_puxador, tipo_puxador_outro, cor_puxador,
      tipo_corredicas, canaleta_led, itens_extra, preco_unitario_sugerido
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `, [
    campos.nome,
    campos.largura,
    campos.profundidade,
    campos.altura,
    campos.espessura_mdf,
    campos.padrao_mdf,
    campos.tipo_fundo,
    campos.tipo_porta,
    campos.tipo_puxador,
    campos.tipo_puxador_outro,
    campos.cor_puxador,
    campos.tipo_corredicas,
    campos.canaleta_led,
    campos.itens_extra,
    campos.preco_unitario_sugerido,
  ]);
  return result.rows[0];
}

async function updateProdutoPlanejado(id, data) {
  const db = getPool();
  const campos = normalizarCamposPlanejado(data);
  if (!campos.nome) throw new Error('Informe o nome do tipo de móvel.');

  const result = await db.query(`
    UPDATE produtos_planejados SET
      nome = $2, largura = $3, profundidade = $4, altura = $5,
      espessura_mdf = $6, padrao_mdf = $7, tipo_fundo = $8, tipo_porta = $9,
      tipo_puxador = $10, tipo_puxador_outro = $11, cor_puxador = $12,
      tipo_corredicas = $13, canaleta_led = $14, itens_extra = $15,
      preco_unitario_sugerido = $16, atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    campos.nome,
    campos.largura,
    campos.profundidade,
    campos.altura,
    campos.espessura_mdf,
    campos.padrao_mdf,
    campos.tipo_fundo,
    campos.tipo_porta,
    campos.tipo_puxador,
    campos.tipo_puxador_outro,
    campos.cor_puxador,
    campos.tipo_corredicas,
    campos.canaleta_led,
    campos.itens_extra,
    campos.preco_unitario_sugerido,
  ]);
  if (result.rowCount === 0) throw new Error('Produto planejado não encontrado.');
  return result.rows[0];
}

async function deleteProdutoPlanejado(id) {
  const db = getPool();
  const result = await db.query(
    'UPDATE produtos_planejados SET ativo = false, atualizado_em = NOW() WHERE id = $1 RETURNING id',
    [id]
  );
  if (result.rowCount === 0) throw new Error('Produto planejado não encontrado.');
  return { id };
}

module.exports = {
  listProdutosPlanejados,
  getProdutoPlanejado,
  createProdutoPlanejado,
  updateProdutoPlanejado,
  deleteProdutoPlanejado,
  normalizarItemPlanejado,
};
