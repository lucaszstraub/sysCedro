const { getPool } = require('./database');
const { getSession } = require('./auth');
const { getVendedorIdFiltro, isPerfilVendedorRestrito } = require('./vendedorUsuario');

const CLASSIFICACOES_VALIDAS = ['moveis_soltos', 'planejados'];

function normalizarClassificacao(classificacao) {
  if (!classificacao || !CLASSIFICACOES_VALIDAS.includes(classificacao)) {
    throw new Error('Informe a classificação do vendedor: móveis soltos ou planejados.');
  }
  return classificacao;
}

async function listVendedores(busca = '', classificacao = null) {
  const db = getPool();
  const params = [`%${busca}%`];
  let filtroClassificacao = '';

  if (classificacao) {
    params.push(normalizarClassificacao(classificacao));
    filtroClassificacao = `AND classificacao = $${params.length}`;
  }

  const vendedorId = getVendedorIdFiltro(getSession());
  let filtroVendedor = '';
  if (vendedorId) {
    params.push(vendedorId);
    filtroVendedor = `AND id = $${params.length}`;
  } else if (getSession() && isPerfilVendedorRestrito(getSession()) && !getSession().vendedor_id) {
    params.push(-1);
    filtroVendedor = `AND id = $${params.length}`;
  }

  const result = await db.query(`
    SELECT * FROM vendedores
    WHERE ativo = true
      AND (nome ILIKE $1 OR email ILIKE $1 OR telefone ILIKE $1)
      ${filtroClassificacao}
      ${filtroVendedor}
    ORDER BY nome
  `, params);
  return result.rows;
}

async function getVendedor(id) {
  const db = getPool();
  const result = await db.query('SELECT * FROM vendedores WHERE id = $1', [id]);
  return result.rows[0];
}

const MENSAGEM_CADASTRO_VENDEDOR = 'Cadastre vendedores no Quadro de colaboradores (Funções administrativas).';

async function createVendedor() {
  throw new Error(MENSAGEM_CADASTRO_VENDEDOR);
}

async function updateVendedor() {
  throw new Error(MENSAGEM_CADASTRO_VENDEDOR);
}

async function deleteVendedor() {
  throw new Error(MENSAGEM_CADASTRO_VENDEDOR);
}

module.exports = {
  listVendedores,
  getVendedor,
  createVendedor,
  updateVendedor,
  deleteVendedor,
};
