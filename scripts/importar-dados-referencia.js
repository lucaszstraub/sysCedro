/**
 * Limpa 100% da base (exceto usuários de acesso) e importa do CSV apenas:
 * - Fornecedores (product_forn)
 * - Categorias / classes de produto (product_class)
 * - Clientes (dados dos pedidos)
 * - Vendedoras como colaboradores (função vendedor)
 *
 * Uso: node scripts/importar-dados-referencia.js
 */

const fs = require('fs');
const path = require('path');
const { getPool } = require('../electron/database');
const { sincronizarVendedorColaborador } = require('../electron/colaboradorVendedor');

const DADOS_DIR = path.join(__dirname, '..', 'DadosReferencia');
const ARQUIVOS = {
  pedidos: 'BDErp - Pedidos.csv',
  produtos: 'BDErp - Produtos.csv',
};

function normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

function truncar(valor, max) {
  const s = String(valor || '').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function normalizarCpfCnpj(valor) {
  const digits = String(valor || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return truncar(valor, 18);
}

function parseEndereco(raw) {
  const texto = String(raw || '').trim();
  if (!texto || texto === ' ') {
    return { endereco: null, cidade: null, estado: null, cep: null };
  }

  const partes = texto.split(',').map((p) => p.trim()).filter(Boolean);
  let cep = null;
  let estado = null;
  let cidade = null;

  if (partes.length > 0) {
    const ultima = partes[partes.length - 1];
    if (/^\d{5}-?\d{3}$/.test(ultima) || /^\d{8}$/.test(ultima)) {
      cep = ultima.replace(/\D/g, '');
      if (cep.length === 8) cep = `${cep.slice(0, 5)}-${cep.slice(5)}`;
      partes.pop();
    }
  }

  if (partes.length > 0) {
    const penultima = partes[partes.length - 1];
    const estadoMatch = penultima.match(/\b([A-Za-z]{2})\b/);
    if (estadoMatch && penultima.length <= 30) {
      estado = estadoMatch[1].toUpperCase();
      const cidadeTexto = penultima.replace(estadoMatch[0], '').trim();
      if (cidadeTexto) {
        cidade = cidadeTexto;
        partes.pop();
      } else if (partes.length > 1) {
        partes.pop();
        cidade = partes.pop();
      } else {
        partes.pop();
      }
    } else if (partes.length >= 2) {
      cidade = partes.pop();
    }
  }

  return {
    endereco: partes.join(', ') || texto,
    cidade,
    estado,
    cep,
  };
}

function compactarParaComparacao(nome) {
  return normalizarTexto(nome)
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1+/g, '$1');
}

function distanciaLevenshtein(a, b) {
  const linhas = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j += 1) linhas[0][j] = j;

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      if (b[i - 1] === a[j - 1]) {
        linhas[i][j] = linhas[i - 1][j - 1];
      } else {
        linhas[i][j] = Math.min(
          linhas[i - 1][j - 1] + 1,
          linhas[i][j - 1] + 1,
          linhas[i - 1][j] + 1
        );
      }
    }
  }

  return linhas[b.length][a.length];
}

function limiarSimilaridade(chaveA, chaveB) {
  const maxLen = Math.max(chaveA.length, chaveB.length);
  if (maxLen <= 3) return 0;
  if (maxLen <= 5) return 1;
  if (maxLen <= 8) return 2;
  return Math.max(2, Math.floor(maxLen * 0.15));
}

function nomesSimilares(chaveA, chaveB) {
  if (!chaveA || !chaveB) return false;
  if (chaveA === chaveB) return true;

  if (distanciaLevenshtein(chaveA, chaveB) <= limiarSimilaridade(chaveA, chaveB)) {
    return true;
  }

  const [curto, longo] = chaveA.length <= chaveB.length ? [chaveA, chaveB] : [chaveB, chaveA];
  if (curto.length >= 4 && longo.startsWith(curto) && longo.length - curto.length <= 2) {
    return true;
  }

  return false;
}

function pontuacaoNomeExibicao(nome) {
  const bruto = String(nome || '').trim();
  let score = 0;

  if (bruto !== bruto.toUpperCase()) score += 20;
  if (/^[A-ZÀ-Ü]/.test(bruto) && bruto !== bruto.toUpperCase()) score += 10;
  if (bruto === bruto.toUpperCase() && bruto.length > 3) score -= 5;
  score += Math.min(bruto.length, 30) * 0.2;

  return score;
}

function formatarNomeCanonico(nome) {
  const bruto = String(nome || '').trim();
  if (!bruto) return bruto;

  if (bruto === bruto.toUpperCase() && bruto.length > 2) {
    return bruto
      .toLowerCase()
      .split(/(\s+|-)/)
      .map((parte) => {
        if (/^\s+$/.test(parte) || parte === '-') return parte;
        return parte.charAt(0).toUpperCase() + parte.slice(1);
      })
      .join('');
  }

  return bruto
    .split(/(\s+|-)/)
    .map((parte) => {
      if (/^\s+$/.test(parte) || parte === '-') return parte;
      if (parte === parte.toUpperCase() && parte.length <= 4) return parte;
      return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase();
    })
    .join('');
}

function escolherNomeCanonico(contagemPorVariante) {
  const ranking = [...contagemPorVariante.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return pontuacaoNomeExibicao(b[0]) - pontuacaoNomeExibicao(a[0]);
  });

  return formatarNomeCanonico(ranking[0][0]);
}

function agruparNomesSimilares(itens, rotulo = 'itens') {
  const grupos = [];

  for (const item of itens) {
    const bruto = String(item.nome || '').trim();
    if (!bruto) continue;

    const chave = compactarParaComparacao(bruto);
    if (!chave) continue;

    let grupo = grupos.find((g) => nomesSimilares(chave, g.chave));

    if (!grupo) {
      grupo = {
        chave,
        contagemPorVariante: new Map(),
        variantes: [],
        ocorrencias: 0,
      };
      grupos.push(grupo);
    }

    grupo.contagemPorVariante.set(bruto, (grupo.contagemPorVariante.get(bruto) || 0) + item.ocorrencias);
    if (!grupo.variantes.includes(bruto)) grupo.variantes.push(bruto);
    grupo.ocorrencias += item.ocorrencias;

    if (chave.length > grupo.chave.length) grupo.chave = chave;
  }

  const resultado = grupos
    .map((grupo) => ({
      nome: escolherNomeCanonico(grupo.contagemPorVariante),
      ocorrencias: grupo.ocorrencias,
      variantes: grupo.variantes,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const unificados = resultado.filter((item) => item.variantes.length > 1).length;
  console.log(`  ${rotulo}: ${itens.length} variantes → ${resultado.length} cadastros (${unificados} grupos unificados)`);

  return resultado;
}

function coletarContagens(nomesBrutos) {
  const map = new Map();
  for (const bruto of nomesBrutos) {
    const nome = String(bruto || '').trim();
    if (!nome) continue;
    map.set(nome, (map.get(nome) || 0) + 1);
  }
  return [...map.entries()].map(([nome, ocorrencias]) => ({ nome, ocorrencias }));
}

function chaveCliente(row) {
  const cpf = normalizarCpfCnpj(row.clientCpf);
  if (cpf) return `cpf:${cpf}`;
  const nome = normalizarTexto(row.clientName);
  const tel = String(row.clientPnumber || '').replace(/\D/g, '');
  return `nome:${nome}|tel:${tel}`;
}

function lerCsv(nomeArquivo) {
  const conteudo = fs.readFileSync(path.join(DADOS_DIR, nomeArquivo), 'utf8');
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim());
  return linhas.slice(1).map(parseCsvLine);
}

function carregarPedidos() {
  return lerCsv(ARQUIVOS.pedidos)
    .filter((r) => /^\d{5}$/.test(r[0]))
    .map((r) => ({
      clientName: r[5],
      clientCpf: r[6],
      clientPnumber: r[7],
      clientAddress: r[8],
      clientEmail: r[9],
      pedido_vendedora: r[2],
    }));
}

function carregarProdutosCsv() {
  return lerCsv(ARQUIVOS.produtos).filter((r) => /^\d{5}$/.test(r[0]));
}

function extrairFornecedores(prodRows) {
  const nomes = [];
  for (const r of prodRows) {
    const bruto = String(r[3] || '').trim();
    if (!bruto || bruto === '-') continue;
    nomes.push(bruto);
  }
  return agruparNomesSimilares(coletarContagens(nomes), 'Fornecedores');
}

function extrairCategorias(prodRows) {
  const nomes = [];
  for (const r of prodRows) {
    const bruto = String(r[2] || '').trim();
    if (!bruto) continue;
    nomes.push(bruto);
  }
  return agruparNomesSimilares(coletarContagens(nomes), 'Categorias');
}

function extrairClientes(pedRows) {
  const map = new Map();
  for (const row of pedRows) {
    const nome = String(row.clientName || '').trim();
    if (!nome) continue;
    const key = chaveCliente(row);
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

function extrairVendedoras(pedRows) {
  const nomes = [];
  for (const row of pedRows) {
    const bruto = String(row.pedido_vendedora || '').trim();
    if (!bruto) continue;
    nomes.push(bruto);
  }
  return agruparNomesSimilares(coletarContagens(nomes), 'Vendedoras')
    .map((item) => item.nome);
}

async function limparBaseCompleta(client) {
  console.log('Limpando base de dados (preservando usuários de acesso)...');

  await client.query('UPDATE usuarios SET vendedor_id = NULL');

  const { rows } = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'usuarios'
    ORDER BY tablename
  `);

  if (rows.length > 0) {
    const tabelas = rows.map((r) => `"${r.tablename}"`).join(', ');
    await client.query(`TRUNCATE ${tabelas} RESTART IDENTITY CASCADE`);
  }

  console.log(`  ${rows.length} tabelas esvaziadas. Usuários preservados.`);
}

async function importarFornecedores(client, fornecedores) {
  console.log(`Cadastrando ${fornecedores.length} fornecedores...`);
  for (const item of fornecedores) {
    await client.query(
      'INSERT INTO fornecedores (nome, ativo) VALUES ($1, true)',
      [truncar(item.nome, 200)]
    );
  }
}

async function importarCategorias(client, categorias) {
  console.log(`Cadastrando ${categorias.length} categorias (classes de produto)...`);
  for (const item of categorias) {
    await client.query(
      'INSERT INTO categorias (nome) VALUES ($1)',
      [truncar(item.nome, 100)]
    );
  }
}

async function importarClientes(client, clientes) {
  console.log(`Cadastrando ${clientes.length} clientes...`);
  for (const row of clientes) {
    const endereco = parseEndereco(row.clientAddress);
    await client.query(
      `INSERT INTO clientes (
        nome, cpf_cnpj, telefone, email, endereco, cidade, estado, cep, ativo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
      [
        truncar(row.clientName, 200),
        normalizarCpfCnpj(row.clientCpf),
        truncar(row.clientPnumber, 20),
        truncar(row.clientEmail, 150),
        endereco.endereco,
        truncar(endereco.cidade, 100),
        truncar(endereco.estado, 2),
        truncar(endereco.cep, 10),
      ]
    );
  }
}

async function importarVendedoras(client, vendedoras) {
  console.log(`Cadastrando ${vendedoras.length} vendedoras como colaboradores...`);

  for (const nome of vendedoras) {
    const inserted = await client.query(
      `INSERT INTO colaboradores (nome, funcao, salario_base, ativo)
       VALUES ($1, 'vendedor', 0, true)
       RETURNING id, nome, funcao, usuario_id, vendedor_id, ativo`,
      [truncar(nome, 200)]
    );

    await sincronizarVendedorColaborador(client, {
      ...inserted.rows[0],
      email: null,
      telefone: null,
    });
  }
}

async function main() {
  const pedRows = carregarPedidos();
  const prodRows = carregarProdutosCsv();

  const fornecedores = extrairFornecedores(prodRows);
  const categorias = extrairCategorias(prodRows);
  const clientes = extrairClientes(pedRows);
  const vendedoras = extrairVendedoras(pedRows);

  console.log('Dados extraídos dos CSV (após unificação de nomes similares):');
  console.log(`  Fornecedores: ${fornecedores.length}`);
  console.log(`  Categorias:   ${categorias.length}`);
  console.log(`  Clientes:     ${clientes.length}`);
  console.log(`  Vendedoras:   ${vendedoras.join(', ')}`);

  const exemplosForn = fornecedores.filter((f) => f.variantes.length > 1).slice(0, 5);
  if (exemplosForn.length > 0) {
    console.log('\nExemplos de fornecedores unificados:');
    for (const item of exemplosForn) {
      console.log(`  "${item.nome}" ← ${item.variantes.join(', ')}`);
    }
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await limparBaseCompleta(client);
    await importarCategorias(client, categorias);
    await importarFornecedores(client, fornecedores);
    await importarClientes(client, clientes);
    await importarVendedoras(client, vendedoras);
    await client.query('COMMIT');

    const resumo = await client.query(`
      SELECT
        (SELECT count(*)::int FROM categorias) AS categorias,
        (SELECT count(*)::int FROM fornecedores) AS fornecedores,
        (SELECT count(*)::int FROM clientes) AS clientes,
        (SELECT count(*)::int FROM colaboradores) AS colaboradores,
        (SELECT count(*)::int FROM vendedores) AS vendedores,
        (SELECT count(*)::int FROM usuarios) AS usuarios,
        (SELECT count(*)::int FROM produtos) AS produtos,
        (SELECT count(*)::int FROM vendas) AS vendas
    `);

    console.log('\nBase pronta para preenchimento manual em Cadastros:');
    console.log(resumo.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro na importação:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
