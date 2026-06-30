const { getPool } = require('./database');
const { requireSession } = require('./auth');

const TOLERANCIA_BOLETOS = 0.05;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function assertSessao() {
  requireSession();
}

function normalizarNumeroNotaFiscal(valor) {
  const numero = String(valor || '').trim();
  if (!/^\d+$/.test(numero)) {
    throw new Error('Informe o número da nota fiscal (apenas dígitos).');
  }
  return numero;
}

function normalizarDataVencimento(data) {
  const texto = String(data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new Error('Informe a data de vencimento de cada boleto.');
  }
  return texto;
}

function validarSomaBoletos(valorTotal, boletos = []) {
  if (!boletos.length) return;
  const total = round2(valorTotal);
  const soma = round2(boletos.reduce((acc, b) => acc + (Number(b.valor) || 0), 0));
  if (soma > total) {
    throw new Error('A soma dos boletos não pode superar o valor total da nota fiscal.');
  }
  if (soma < round2(total - TOLERANCIA_BOLETOS)) {
    throw new Error(
      `A soma dos boletos deve ser igual ao valor da nota (tolerância de R$ ${TOLERANCIA_BOLETOS.toFixed(2).replace('.', ',')}).`
    );
  }
  boletos.forEach((boleto, index) => {
    const valor = round2(boleto.valor);
    if (valor <= 0) {
      throw new Error(`Informe o valor do boleto ${index + 1}.`);
    }
    normalizarDataVencimento(boleto.data_vencimento);
  });
}

async function obterCentroCustoFornecedores(client) {
  const result = await client.query(`
    SELECT id FROM centros_custo
    WHERE nome = 'Fornecedores' AND ativo = true
    LIMIT 1
  `);
  if (result.rowCount === 0) {
    throw new Error('Centro de custo "Fornecedores" não encontrado. Contate o administrador.');
  }
  return result.rows[0].id;
}

async function criarPagamentoDeBoleto(client, {
  centroCustoId,
  notaFiscal,
  fornecedorNome,
  boleto,
  notaFiscalBoletoId,
}) {
  const descricao = `NF ${notaFiscal.numero} — Boleto ${boleto.parcela} — ${fornecedorNome}`;
  const result = await client.query(`
    INSERT INTO pagamentos_financeiros (
      centro_custo_id, descricao, valor, data_pagamento, observacoes, nota_fiscal_boleto_id
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [
    centroCustoId,
    descricao,
    round2(boleto.valor),
    boleto.data_vencimento,
    `Gerado automaticamente a partir da nota fiscal ${notaFiscal.numero}.`,
    notaFiscalBoletoId,
  ]);
  return result.rows[0].id;
}

function mapNotaFiscal(row) {
  return {
    ...row,
    valor_total: round2(row.valor_total),
    total_boletos: Number(row.total_boletos) || 0,
    total_recebimentos: Number(row.total_recebimentos) || 0,
  };
}

function mapBoleto(row) {
  return {
    ...row,
    valor: round2(row.valor),
  };
}

async function listNotasFiscais(busca = '', fornecedorId = null) {
  assertSessao();
  const db = getPool();
  const termo = `%${busca}%`;
  const fornecedor = fornecedorId ? Number(fornecedorId) : null;

  const result = await db.query(`
    SELECT
      nf.*,
      f.nome AS fornecedor_nome,
      (
        SELECT COUNT(*)::int
        FROM nota_fiscal_boletos b
        WHERE b.nota_fiscal_id = nf.id
      ) AS total_boletos,
      (
        SELECT COUNT(*)::int
        FROM recebimento_encomenda_itens r
        WHERE r.nota_fiscal_id = nf.id AND NOT r.estornado
      ) AS total_recebimentos
    FROM notas_fiscais nf
    JOIN fornecedores f ON f.id = nf.fornecedor_id
    WHERE ($1 = '' OR nf.numero ILIKE $1 OR f.nome ILIKE $1 OR COALESCE(nf.observacoes, '') ILIKE $1)
      AND ($2::int IS NULL OR nf.fornecedor_id = $2)
    ORDER BY nf.criado_em DESC, nf.id DESC
  `, [termo, fornecedor]);

  return result.rows.map(mapNotaFiscal);
}

async function getNotaFiscal(id) {
  assertSessao();
  const db = getPool();
  const header = await db.query(`
    SELECT nf.*, f.nome AS fornecedor_nome
    FROM notas_fiscais nf
    JOIN fornecedores f ON f.id = nf.fornecedor_id
    WHERE nf.id = $1
  `, [id]);
  if (header.rowCount === 0) throw new Error('Nota fiscal não encontrada.');

  const boletos = await db.query(`
    SELECT b.*, pf.id AS pagamento_financeiro_id
    FROM nota_fiscal_boletos b
    LEFT JOIN pagamentos_financeiros pf ON pf.nota_fiscal_boleto_id = b.id
    WHERE b.nota_fiscal_id = $1
    ORDER BY b.parcela
  `, [id]);

  return {
    ...mapNotaFiscal({ ...header.rows[0], total_boletos: boletos.rowCount, total_recebimentos: 0 }),
    boletos: boletos.rows.map(mapBoleto),
  };
}

async function createNotaFiscal(data) {
  assertSessao();
  const fornecedorId = Number(data.fornecedor_id);
  const numero = normalizarNumeroNotaFiscal(data.numero);
  const valorTotal = round2(data.valor_total);
  const boletos = Array.isArray(data.boletos) ? data.boletos : [];

  if (!fornecedorId) throw new Error('Selecione o fornecedor.');
  if (valorTotal <= 0) throw new Error('Informe o valor total da nota fiscal.');
  validarSomaBoletos(valorTotal, boletos);

  const db = getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const fornecedor = await client.query(
      'SELECT id, nome FROM fornecedores WHERE id = $1 AND ativo = true',
      [fornecedorId]
    );
    if (fornecedor.rowCount === 0) throw new Error('Fornecedor não encontrado ou inativo.');

    const duplicada = await client.query(
      'SELECT id FROM notas_fiscais WHERE fornecedor_id = $1 AND numero = $2',
      [fornecedorId, numero]
    );
    if (duplicada.rowCount > 0) {
      throw new Error('Já existe uma nota fiscal com este número para o fornecedor selecionado.');
    }

    const nota = await client.query(`
      INSERT INTO notas_fiscais (fornecedor_id, numero, valor_total, observacoes)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      fornecedorId,
      numero,
      valorTotal,
      data.observacoes?.trim() || null,
    ]);

    const notaFiscal = nota.rows[0];
    const boletosSalvos = [];

    if (boletos.length > 0) {
      const centroCustoId = await obterCentroCustoFornecedores(client);
      const fornecedorNome = fornecedor.rows[0].nome;

      for (let index = 0; index < boletos.length; index += 1) {
        const entrada = boletos[index];
        const boleto = {
          parcela: index + 1,
          valor: round2(entrada.valor),
          data_vencimento: normalizarDataVencimento(entrada.data_vencimento),
        };

        const boletoRow = await client.query(`
          INSERT INTO nota_fiscal_boletos (nota_fiscal_id, parcela, valor, data_vencimento)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [notaFiscal.id, boleto.parcela, boleto.valor, boleto.data_vencimento]);

        const pagamentoId = await criarPagamentoDeBoleto(client, {
          centroCustoId,
          notaFiscal,
          fornecedorNome,
          boleto,
          notaFiscalBoletoId: boletoRow.rows[0].id,
        });

        boletosSalvos.push({
          ...mapBoleto(boletoRow.rows[0]),
          pagamento_financeiro_id: pagamentoId,
        });
      }
    }

    await client.query('COMMIT');
    return {
      ...mapNotaFiscal({
        ...notaFiscal,
        fornecedor_nome: fornecedor.rows[0].nome,
        total_boletos: boletosSalvos.length,
        total_recebimentos: 0,
      }),
      boletos: boletosSalvos,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function assertNotaFiscalDoFornecedor(client, notaFiscalId, fornecedorId) {
  const result = await client.query(
    'SELECT id, numero, fornecedor_id FROM notas_fiscais WHERE id = $1',
    [notaFiscalId]
  );
  if (result.rowCount === 0) throw new Error('Nota fiscal não encontrada.');
  const nota = result.rows[0];
  if (Number(nota.fornecedor_id) !== Number(fornecedorId)) {
    throw new Error('A nota fiscal selecionada não pertence ao fornecedor desta encomenda.');
  }
  return nota;
}

module.exports = {
  TOLERANCIA_BOLETOS,
  normalizarNumeroNotaFiscal,
  validarSomaBoletos,
  listNotasFiscais,
  getNotaFiscal,
  createNotaFiscal,
  assertNotaFiscalDoFornecedor,
};
