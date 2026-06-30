const { getPool } = require('./database');
const { getSession } = require('./auth');

const ETAPAS_VALIDAS = new Set(['concretizado', 'fabrica', 'deposito', 'montagem', 'finalizado']);

async function gerarNumeroAssistencia() {
  const db = getPool();
  const result = await db.query(`
    SELECT COALESCE(MAX(
      CAST(NULLIF(regexp_replace(numero, '^AST-PL-', ''), '') AS INTEGER)
    ), 0) + 1 AS proximo
    FROM acompanhamento_pedidos_planejados
    WHERE numero LIKE 'AST-PL-%'
  `);
  return `AST-PL-${String(result.rows[0].proximo).padStart(5, '0')}`;
}

async function sincronizarVendasConcretizadas(client) {
  const db = client || getPool();
  await db.query(`
    INSERT INTO acompanhamento_pedidos_planejados (numero, tipo, venda_planejado_id, etapa)
    SELECT v.numero, 'venda', v.id, 'concretizado'
    FROM vendas_planejados v
    WHERE v.status = 'confirmada'
      AND NOT EXISTS (
        SELECT 1 FROM acompanhamento_pedidos_planejados a
        WHERE a.venda_planejado_id = v.id AND a.tipo = 'venda'
      )
  `);
}

async function ensureAcompanhamentoVenda(vendaId, client) {
  const db = client || getPool();
  const venda = await db.query(
    'SELECT id, numero, status FROM vendas_planejados WHERE id = $1',
    [vendaId]
  );
  if (venda.rowCount === 0 || venda.rows[0].status !== 'confirmada') return null;

  const existente = await db.query(`
    SELECT id FROM acompanhamento_pedidos_planejados
    WHERE venda_planejado_id = $1 AND tipo = 'venda'
  `, [vendaId]);
  if (existente.rowCount > 0) return existente.rows[0].id;

  const inserted = await db.query(`
    INSERT INTO acompanhamento_pedidos_planejados (numero, tipo, venda_planejado_id, etapa)
    VALUES ($1, 'venda', $2, 'concretizado')
    RETURNING id
  `, [venda.rows[0].numero, vendaId]);
  return inserted.rows[0].id;
}

async function listAcompanhamentoPedidos(busca = '') {
  const db = getPool();
  await sincronizarVendasConcretizadas();

  const termo = `%${busca}%`;
  const result = await db.query(`
    SELECT
      a.*,
      v.numero AS venda_numero,
      v.numero_pedido,
      v.total,
      v.prazo_entrega_dias,
      v.prazo_entrega_outro,
      v.criado_em AS venda_criado_em,
      c.nome AS cliente_nome,
      vd.nome AS vendedor_nome,
      (
        SELECT COUNT(*)::int
        FROM acompanhamento_pedido_anotacoes an
        WHERE an.acompanhamento_id = a.id
      ) AS total_anotacoes,
      (
        SELECT an.texto
        FROM acompanhamento_pedido_anotacoes an
        WHERE an.acompanhamento_id = a.id
        ORDER BY an.criado_em DESC
        LIMIT 1
      ) AS ultima_anotacao
    FROM acompanhamento_pedidos_planejados a
    JOIN vendas_planejados v ON v.id = a.venda_planejado_id
    JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE v.status = 'confirmada'
      AND ($1 = '' OR a.numero ILIKE $1 OR v.numero ILIKE $1 OR v.numero_pedido ILIKE $1
           OR c.nome ILIKE $1 OR a.descricao_assistencia ILIKE $1)
    ORDER BY a.atualizado_em DESC
  `, [termo]);
  return result.rows;
}

async function moverAcompanhamentoKanban(id, { etapa }) {
  if (!ETAPAS_VALIDAS.has(etapa)) {
    throw new Error('Etapa inválida no kanban de acompanhamento.');
  }

  const db = getPool();
  const atual = await db.query('SELECT * FROM acompanhamento_pedidos_planejados WHERE id = $1', [id]);
  if (atual.rowCount === 0) throw new Error('Pedido não encontrado no acompanhamento.');
  if (atual.rows[0].etapa === etapa) return atual.rows[0];

  const setFabrica = etapa === 'fabrica' && !atual.rows[0].data_passagem_fabrica
    ? ', data_passagem_fabrica = NOW()'
    : '';

  const result = await db.query(`
    UPDATE acompanhamento_pedidos_planejados
    SET etapa = $2, atualizado_em = NOW()${setFabrica}
    WHERE id = $1
    RETURNING *
  `, [id, etapa]);
  return result.rows[0];
}

async function criarAssistenciaTecnica({ venda_planejado_id, descricao_assistencia }) {
  const vendaId = Number(venda_planejado_id);
  if (!vendaId) throw new Error('Selecione a venda de origem.');

  const descricao = (descricao_assistencia || '').trim();
  if (!descricao) throw new Error('Descreva a assistência técnica pendente.');

  const db = getPool();
  const venda = await db.query(
    'SELECT id, status FROM vendas_planejados WHERE id = $1',
    [vendaId]
  );
  if (venda.rowCount === 0) throw new Error('Venda planejada não encontrada.');
  if (venda.rows[0].status !== 'confirmada') {
    throw new Error('Somente vendas confirmadas podem gerar assistência técnica.');
  }

  const numero = await gerarNumeroAssistencia();
  const result = await db.query(`
    INSERT INTO acompanhamento_pedidos_planejados (
      numero, tipo, venda_planejado_id, etapa, descricao_assistencia
    )
    VALUES ($1, 'assistencia', $2, 'concretizado', $3)
    RETURNING *
  `, [numero, vendaId, descricao]);

  return result.rows[0];
}

async function assertAutorAnotacao(anotacao) {
  const session = getSession();
  if (!session) throw new Error('Faça login para continuar.');

  if (anotacao.autor_usuario_id != null) {
    if (Number(anotacao.autor_usuario_id) !== Number(session.id)) {
      throw new Error('Somente o autor pode alterar esta observação.');
    }
    return;
  }

  const autor = (anotacao.autor_nome || '').trim().toLowerCase();
  const identidades = [session.nome, session.login]
    .filter(Boolean)
    .map((s) => s.trim().toLowerCase());
  if (!identidades.includes(autor)) {
    throw new Error('Somente o autor pode alterar esta observação.');
  }
}

async function touchAcompanhamento(db, acompanhamentoId) {
  await db.query(
    'UPDATE acompanhamento_pedidos_planejados SET atualizado_em = NOW() WHERE id = $1',
    [acompanhamentoId]
  );
}

async function listAnotacoes(acompanhamentoId) {
  const db = getPool();
  const result = await db.query(`
    SELECT * FROM acompanhamento_pedido_anotacoes
    WHERE acompanhamento_id = $1
    ORDER BY criado_em DESC
  `, [acompanhamentoId]);
  return result.rows;
}

async function adicionarAnotacao(acompanhamentoId, texto) {
  const conteudo = (texto || '').trim();
  if (!conteudo) throw new Error('Informe o texto da observação.');

  const db = getPool();
  const existe = await db.query(
    'SELECT id FROM acompanhamento_pedidos_planejados WHERE id = $1',
    [acompanhamentoId]
  );
  if (existe.rowCount === 0) throw new Error('Pedido não encontrado.');

  const session = getSession();
  const autor = session?.nome || session?.login || 'Usuário';
  const autorId = session?.id || null;

  const result = await db.query(`
    INSERT INTO acompanhamento_pedido_anotacoes (acompanhamento_id, texto, autor_nome, autor_usuario_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [acompanhamentoId, conteudo, autor, autorId]);

  await touchAcompanhamento(db, acompanhamentoId);

  return result.rows[0];
}

async function atualizarAnotacao(anotacaoId, texto) {
  const conteudo = (texto || '').trim();
  if (!conteudo) throw new Error('Informe o texto da observação.');

  const db = getPool();
  const atual = await db.query(
    'SELECT * FROM acompanhamento_pedido_anotacoes WHERE id = $1',
    [anotacaoId]
  );
  if (atual.rowCount === 0) throw new Error('Observação não encontrada.');

  await assertAutorAnotacao(atual.rows[0]);

  const result = await db.query(`
    UPDATE acompanhamento_pedido_anotacoes
    SET texto = $2, atualizado_em = NOW()
    WHERE id = $1
    RETURNING *
  `, [anotacaoId, conteudo]);

  await touchAcompanhamento(db, atual.rows[0].acompanhamento_id);
  return result.rows[0];
}

async function excluirAnotacao(anotacaoId) {
  const db = getPool();
  const atual = await db.query(
    'SELECT * FROM acompanhamento_pedido_anotacoes WHERE id = $1',
    [anotacaoId]
  );
  if (atual.rowCount === 0) throw new Error('Observação não encontrada.');

  await assertAutorAnotacao(atual.rows[0]);

  await db.query('DELETE FROM acompanhamento_pedido_anotacoes WHERE id = $1', [anotacaoId]);
  await touchAcompanhamento(db, atual.rows[0].acompanhamento_id);
  return { success: true };
}

module.exports = {
  sincronizarVendasConcretizadas,
  ensureAcompanhamentoVenda,
  listAcompanhamentoPedidos,
  moverAcompanhamentoKanban,
  criarAssistenciaTecnica,
  listAnotacoes,
  adicionarAnotacao,
  atualizarAnotacao,
  excluirAnotacao,
};
