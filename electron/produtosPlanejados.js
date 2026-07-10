const { getPool } = require('./database');

const TIPOS_FUNDO = ['vazado', 'grosso', 'fino', 'com_manta_isolante', 'outro'];
const TIPOS_PORTA = ['sem_porta', 'porta_correr', 'porta_giro', 'outro'];
const TIPOS_PUXADOR = ['sem_puxador', 'usinado', 'versatille', 'px_60', 'roma_8015', 'sier_recorte_45', 'outro'];
const TIPOS_CORREDICAS = ['sem_corredicas', 'padrao', 'invisiveis', 'outro'];

function normalizarCampoComOutro(valor, outro, tiposValidos, padrao) {
  const tipo = tiposValidos.includes(valor) ? valor : padrao;
  return {
    tipo,
    outro: tipo === 'outro' ? ((outro || '').trim() || null) : null,
  };
}

function normalizarCamposPlanejado(data, { validarOutro = false } = {}) {
  const fundo = normalizarCampoComOutro(data.tipo_fundo, data.tipo_fundo_outro, TIPOS_FUNDO, 'fino');
  const porta = normalizarCampoComOutro(data.tipo_porta, data.tipo_porta_outro, TIPOS_PORTA, 'sem_porta');
  const puxador = normalizarCampoComOutro(data.tipo_puxador, data.tipo_puxador_outro, TIPOS_PUXADOR, 'sem_puxador');
  const corredicas = normalizarCampoComOutro(
    data.tipo_corredicas,
    data.tipo_corredicas_outro,
    TIPOS_CORREDICAS,
    'sem_corredicas'
  );

  if (validarOutro) {
    if (fundo.tipo === 'outro' && !fundo.outro) {
      throw new Error('Informe o tipo de fundo quando selecionar "Outro".');
    }
    if (porta.tipo === 'outro' && !porta.outro) {
      throw new Error('Informe o tipo de porta quando selecionar "Outro".');
    }
    if (puxador.tipo === 'outro' && !puxador.outro) {
      throw new Error('Informe o tipo de puxador quando selecionar "Outro".');
    }
    if (corredicas.tipo === 'outro' && !corredicas.outro) {
      throw new Error('Informe o tipo de corrediças quando selecionar "Outro".');
    }
  }

  return {
    nome: (data.nome || '').trim(),
    largura: data.largura != null && data.largura !== '' ? Number(data.largura) : null,
    profundidade: data.profundidade != null && data.profundidade !== '' ? Number(data.profundidade) : null,
    altura: data.altura != null && data.altura !== '' ? Number(data.altura) : null,
    espessura_mdf: Number(data.espessura_mdf) || 18,
    padrao_mdf: (data.padrao_mdf || '').trim() || null,
    tipo_fundo: fundo.tipo,
    tipo_fundo_outro: fundo.outro,
    tipo_porta: porta.tipo,
    tipo_porta_outro: porta.outro,
    tipo_puxador: puxador.tipo,
    tipo_puxador_outro: puxador.outro,
    cor_puxador: (data.cor_puxador || '').trim() || null,
    tipo_corredicas: corredicas.tipo,
    tipo_corredicas_outro: corredicas.outro,
    canaleta_led: Boolean(data.canaleta_led),
    itens_extra: (data.itens_extra || '').trim() || null,
    preco_unitario_sugerido: Number(data.preco_unitario_sugerido) || 0,
  };
}

function normalizarItemPlanejado(item) {
  const campos = normalizarCamposPlanejado(item);
  return {
    descricao: (item.descricao || '').trim(),
    produto_planejado_id: item.produto_planejado_id ? Number(item.produto_planejado_id) : null,
    largura: campos.largura,
    profundidade: campos.profundidade,
    altura: campos.altura,
    espessura_mdf: campos.espessura_mdf,
    padrao_mdf: campos.padrao_mdf,
    tipo_fundo: campos.tipo_fundo,
    tipo_fundo_outro: campos.tipo_fundo_outro,
    tipo_porta: campos.tipo_porta,
    tipo_porta_outro: campos.tipo_porta_outro,
    tipo_puxador: campos.tipo_puxador,
    tipo_puxador_outro: campos.tipo_puxador_outro,
    cor_puxador: campos.cor_puxador,
    tipo_corredicas: campos.tipo_corredicas,
    tipo_corredicas_outro: campos.tipo_corredicas_outro,
    canaleta_led: campos.canaleta_led,
    itens_extra: campos.itens_extra,
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
  const campos = normalizarCamposPlanejado(data, { validarOutro: true });
  if (!campos.nome) throw new Error('Informe o nome do tipo de móvel.');

  const result = await db.query(`
    INSERT INTO produtos_planejados (
      nome, largura, profundidade, altura, espessura_mdf, padrao_mdf,
      tipo_fundo, tipo_fundo_outro, tipo_porta, tipo_porta_outro,
      tipo_puxador, tipo_puxador_outro, cor_puxador,
      tipo_corredicas, tipo_corredicas_outro, canaleta_led, itens_extra, preco_unitario_sugerido
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *
  `, [
    campos.nome,
    campos.largura,
    campos.profundidade,
    campos.altura,
    campos.espessura_mdf,
    campos.padrao_mdf,
    campos.tipo_fundo,
    campos.tipo_fundo_outro,
    campos.tipo_porta,
    campos.tipo_porta_outro,
    campos.tipo_puxador,
    campos.tipo_puxador_outro,
    campos.cor_puxador,
    campos.tipo_corredicas,
    campos.tipo_corredicas_outro,
    campos.canaleta_led,
    campos.itens_extra,
    campos.preco_unitario_sugerido,
  ]);
  return result.rows[0];
}

async function updateProdutoPlanejado(id, data) {
  const db = getPool();
  const campos = normalizarCamposPlanejado(data, { validarOutro: true });
  if (!campos.nome) throw new Error('Informe o nome do tipo de móvel.');

  const result = await db.query(`
    UPDATE produtos_planejados SET
      nome = $2, largura = $3, profundidade = $4, altura = $5,
      espessura_mdf = $6, padrao_mdf = $7,
      tipo_fundo = $8, tipo_fundo_outro = $9,
      tipo_porta = $10, tipo_porta_outro = $11,
      tipo_puxador = $12, tipo_puxador_outro = $13, cor_puxador = $14,
      tipo_corredicas = $15, tipo_corredicas_outro = $16,
      canaleta_led = $17, itens_extra = $18,
      preco_unitario_sugerido = $19, atualizado_em = NOW()
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
    campos.tipo_fundo_outro,
    campos.tipo_porta,
    campos.tipo_porta_outro,
    campos.tipo_puxador,
    campos.tipo_puxador_outro,
    campos.cor_puxador,
    campos.tipo_corredicas,
    campos.tipo_corredicas_outro,
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
