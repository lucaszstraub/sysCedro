const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const OUTPUT = path.join(__dirname, '..', 'docs', 'arquitetura-base-dados.pdf');

const SCHEMA = {
  modulos: [
    {
      nome: 'Catálogo e Armazém (WMS)',
      tabelas: ['categorias', 'fornecedores', 'produtos', 'localizacoes', 'estoque', 'movimentacoes'],
    },
    {
      nome: 'Comercial',
      tabelas: ['clientes', 'orcamentos', 'orcamento_ambientes', 'orcamento_itens'],
    },
    {
      nome: 'Vendas (planejado)',
      tabelas: ['vendedores', 'vendas', 'venda_itens'],
      planejado: true,
    },
  ],
  tabelas: {
    categorias: {
      descricao: 'Categorias de móveis (Sofás, Mesas, etc.)',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'nome', tipo: 'VARCHAR(100)', uk: true },
        { nome: 'descricao', tipo: 'TEXT' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [],
    },
    fornecedores: {
      descricao: 'Fornecedores de produtos',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'nome', tipo: 'VARCHAR(200)' },
        { nome: 'cnpj', tipo: 'VARCHAR(18)' },
        { nome: 'telefone', tipo: 'VARCHAR(20)' },
        { nome: 'email', tipo: 'VARCHAR(150)' },
        { nome: 'endereco', tipo: 'TEXT' },
        { nome: 'ativo', tipo: 'BOOLEAN' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [],
    },
    localizacoes: {
      descricao: 'Posições físicas no armazém',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'codigo', tipo: 'VARCHAR(50)', uk: true },
        { nome: 'nome', tipo: 'VARCHAR(150)' },
        { nome: 'corredor', tipo: 'VARCHAR(50)' },
        { nome: 'prateleira', tipo: 'VARCHAR(50)' },
        { nome: 'capacidade', tipo: 'INTEGER' },
        { nome: 'ativo', tipo: 'BOOLEAN' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [],
    },
    produtos: {
      descricao: 'Cadastro de móveis e itens',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'sku', tipo: 'VARCHAR(50)', uk: true },
        { nome: 'nome', tipo: 'VARCHAR(200)' },
        { nome: 'categoria_id', tipo: 'INTEGER', fk: 'categorias.id' },
        { nome: 'fornecedor_id', tipo: 'INTEGER', fk: 'fornecedores.id' },
        { nome: 'descricao', tipo: 'TEXT' },
        { nome: 'material', tipo: 'VARCHAR(100)' },
        { nome: 'cor', tipo: 'VARCHAR(80)' },
        { nome: 'largura_cm', tipo: 'NUMERIC(8,2)' },
        { nome: 'altura_cm', tipo: 'NUMERIC(8,2)' },
        { nome: 'profundidade_cm', tipo: 'NUMERIC(8,2)' },
        { nome: 'peso_kg', tipo: 'NUMERIC(8,2)' },
        { nome: 'preco_custo', tipo: 'NUMERIC(12,2)' },
        { nome: 'preco_venda', tipo: 'NUMERIC(12,2)' },
        { nome: 'estoque_minimo', tipo: 'INTEGER' },
        { nome: 'foto_path', tipo: 'VARCHAR(255)' },
        { nome: 'ativo', tipo: 'BOOLEAN' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
        { nome: 'atualizado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [
        { coluna: 'categoria_id', referencia: 'categorias(id)' },
        { coluna: 'fornecedor_id', referencia: 'fornecedores(id)' },
      ],
    },
    estoque: {
      descricao: 'Saldo por produto e localização',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'produto_id', tipo: 'INTEGER', fk: 'produtos.id' },
        { nome: 'localizacao_id', tipo: 'INTEGER', fk: 'localizacoes.id' },
        { nome: 'quantidade', tipo: 'INTEGER' },
        { nome: 'atualizado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [
        { coluna: 'produto_id', referencia: 'produtos(id)', onDelete: 'CASCADE' },
        { coluna: 'localizacao_id', referencia: 'localizacoes(id)', onDelete: 'CASCADE' },
      ],
      unique: ['(produto_id, localizacao_id)'],
    },
    movimentacoes: {
      descricao: 'Histórico de entradas, saídas e transferências',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'produto_id', tipo: 'INTEGER', fk: 'produtos.id' },
        { nome: 'localizacao_origem_id', tipo: 'INTEGER', fk: 'localizacoes.id' },
        { nome: 'localizacao_destino_id', tipo: 'INTEGER', fk: 'localizacoes.id' },
        { nome: 'tipo', tipo: 'VARCHAR(20)' },
        { nome: 'quantidade', tipo: 'INTEGER' },
        { nome: 'motivo', tipo: 'TEXT' },
        { nome: 'usuario', tipo: 'VARCHAR(100)' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [
        { coluna: 'produto_id', referencia: 'produtos(id)' },
        { coluna: 'localizacao_origem_id', referencia: 'localizacoes(id)' },
        { coluna: 'localizacao_destino_id', referencia: 'localizacoes(id)' },
      ],
    },
    clientes: {
      descricao: 'Clientes da loja',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'nome', tipo: 'VARCHAR(200)' },
        { nome: 'cpf_cnpj', tipo: 'VARCHAR(18)' },
        { nome: 'telefone', tipo: 'VARCHAR(20)' },
        { nome: 'email', tipo: 'VARCHAR(150)' },
        { nome: 'endereco', tipo: 'TEXT' },
        { nome: 'cidade', tipo: 'VARCHAR(100)' },
        { nome: 'estado', tipo: 'VARCHAR(2)' },
        { nome: 'cep', tipo: 'VARCHAR(10)' },
        { nome: 'observacoes', tipo: 'TEXT' },
        { nome: 'ativo', tipo: 'BOOLEAN' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [],
    },
    orcamentos: {
      descricao: 'Orçamentos comerciais',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'numero', tipo: 'VARCHAR(20)', uk: true },
        { nome: 'cliente_id', tipo: 'INTEGER', fk: 'clientes.id' },
        { nome: 'status', tipo: 'VARCHAR(20)' },
        { nome: 'validade', tipo: 'DATE' },
        { nome: 'observacoes', tipo: 'TEXT' },
        { nome: 'subtotal', tipo: 'NUMERIC(12,2)' },
        { nome: 'desconto', tipo: 'NUMERIC(12,2)' },
        { nome: 'total', tipo: 'NUMERIC(12,2)' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
        { nome: 'atualizado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [
        { coluna: 'cliente_id', referencia: 'clientes(id)' },
      ],
    },
    orcamento_ambientes: {
      descricao: 'Ambientes dentro de um orçamento (Sala, Quarto...)',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'orcamento_id', tipo: 'INTEGER', fk: 'orcamentos.id' },
        { nome: 'nome', tipo: 'VARCHAR(150)' },
        { nome: 'ordem', tipo: 'INTEGER' },
      ],
      fks: [
        { coluna: 'orcamento_id', referencia: 'orcamentos(id)', onDelete: 'CASCADE' },
      ],
    },
    orcamento_itens: {
      descricao: 'Itens de cada ambiente do orçamento',
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'orcamento_id', tipo: 'INTEGER', fk: 'orcamentos.id' },
        { nome: 'ambiente_id', tipo: 'INTEGER', fk: 'orcamento_ambientes.id' },
        { nome: 'produto_id', tipo: 'INTEGER', fk: 'produtos.id' },
        { nome: 'descricao', tipo: 'VARCHAR(300)' },
        { nome: 'quantidade', tipo: 'INTEGER' },
        { nome: 'preco_unitario', tipo: 'NUMERIC(12,2)' },
        { nome: 'subtotal', tipo: 'NUMERIC(12,2)' },
        { nome: 'ordem', tipo: 'INTEGER' },
      ],
      fks: [
        { coluna: 'orcamento_id', referencia: 'orcamentos(id)', onDelete: 'CASCADE' },
        { coluna: 'ambiente_id', referencia: 'orcamento_ambientes(id)', onDelete: 'CASCADE' },
        { coluna: 'produto_id', referencia: 'produtos(id)' },
      ],
    },
    vendedores: {
      descricao: 'Equipe de vendas (planejado)',
      planejado: true,
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'nome', tipo: 'VARCHAR(200)' },
        { nome: 'cpf', tipo: 'VARCHAR(14)', uk: true },
        { nome: 'email', tipo: 'VARCHAR(150)' },
        { nome: 'telefone', tipo: 'VARCHAR(20)' },
        { nome: 'comissao_percentual', tipo: 'NUMERIC(5,2)' },
        { nome: 'ativo', tipo: 'BOOLEAN' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [],
    },
    vendas: {
      descricao: 'Pedidos de venda fechados (planejado)',
      planejado: true,
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'numero', tipo: 'VARCHAR(20)', uk: true },
        { nome: 'cliente_id', tipo: 'INTEGER', fk: 'clientes.id' },
        { nome: 'vendedor_id', tipo: 'INTEGER', fk: 'vendedores.id' },
        { nome: 'orcamento_id', tipo: 'INTEGER', fk: 'orcamentos.id' },
        { nome: 'status', tipo: 'VARCHAR(20)' },
        { nome: 'subtotal', tipo: 'NUMERIC(12,2)' },
        { nome: 'desconto', tipo: 'NUMERIC(12,2)' },
        { nome: 'total', tipo: 'NUMERIC(12,2)' },
        { nome: 'observacoes', tipo: 'TEXT' },
        { nome: 'criado_em', tipo: 'TIMESTAMP' },
        { nome: 'atualizado_em', tipo: 'TIMESTAMP' },
      ],
      fks: [
        { coluna: 'cliente_id', referencia: 'clientes(id)' },
        { coluna: 'vendedor_id', referencia: 'vendedores(id)' },
        { coluna: 'orcamento_id', referencia: 'orcamentos(id)' },
      ],
    },
    venda_itens: {
      descricao: 'Itens vendidos em cada pedido (planejado)',
      planejado: true,
      colunas: [
        { nome: 'id', tipo: 'SERIAL', pk: true },
        { nome: 'venda_id', tipo: 'INTEGER', fk: 'vendas.id' },
        { nome: 'produto_id', tipo: 'INTEGER', fk: 'produtos.id' },
        { nome: 'descricao', tipo: 'VARCHAR(300)' },
        { nome: 'quantidade', tipo: 'INTEGER' },
        { nome: 'preco_unitario', tipo: 'NUMERIC(12,2)' },
        { nome: 'subtotal', tipo: 'NUMERIC(12,2)' },
      ],
      fks: [
        { coluna: 'venda_id', referencia: 'vendas(id)', onDelete: 'CASCADE' },
        { coluna: 'produto_id', referencia: 'produtos(id)' },
      ],
    },
  },
};

const RELACIONAMENTOS = [
  { de: 'produtos', para: 'categorias', rotulo: 'categoria_id → id' },
  { de: 'produtos', para: 'fornecedores', rotulo: 'fornecedor_id → id' },
  { de: 'estoque', para: 'produtos', rotulo: 'produto_id → id' },
  { de: 'estoque', para: 'localizacoes', rotulo: 'localizacao_id → id' },
  { de: 'movimentacoes', para: 'produtos', rotulo: 'produto_id → id' },
  { de: 'movimentacoes', para: 'localizacoes', rotulo: 'origem/destino → id' },
  { de: 'orcamentos', para: 'clientes', rotulo: 'cliente_id → id' },
  { de: 'orcamento_ambientes', para: 'orcamentos', rotulo: 'orcamento_id → id' },
  { de: 'orcamento_itens', para: 'orcamentos', rotulo: 'orcamento_id → id' },
  { de: 'orcamento_itens', para: 'orcamento_ambientes', rotulo: 'ambiente_id → id' },
  { de: 'orcamento_itens', para: 'produtos', rotulo: 'produto_id → id' },
  { de: 'vendas', para: 'clientes', rotulo: 'cliente_id → id', futuro: true },
  { de: 'vendas', para: 'vendedores', rotulo: 'vendedor_id → id', futuro: true },
  { de: 'vendas', para: 'orcamentos', rotulo: 'orcamento_id → id', futuro: true },
  { de: 'venda_itens', para: 'vendas', rotulo: 'venda_id → id', futuro: true },
  { de: 'venda_itens', para: 'produtos', rotulo: 'produto_id → id', futuro: true },
];

function ensureSpace(doc, y, needed = 40) {
  if (y + needed > doc.page.height - 60) {
    doc.addPage();
    return 50;
  }
  return y;
}

function drawTableBox(doc, x, y, nome, tabela, largura = 155) {
  const isFuture = tabela.planejado;
  const headerH = 18;
  const lineH = 11;
  const cols = tabela.colunas.slice(0, 8);
  const extra = tabela.colunas.length > 8 ? 1 : 0;
  const boxH = headerH + (cols.length + extra) * lineH + 8;

  doc.save();
  if (isFuture) {
    doc.dash(3, { space: 2 });
    doc.strokeColor('#b8860b');
  } else {
    doc.strokeColor('#8b5e3c');
  }

  doc.rect(x, y, largura, boxH).stroke();
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(8).fillColor(isFuture ? '#b8860b' : '#2c2419');
  doc.text(nome + (isFuture ? ' *' : ''), x + 4, y + 4, { width: largura - 8 });

  let cy = y + headerH;
  doc.font('Helvetica').fontSize(7).fillColor('#2c2419');

  cols.forEach((col) => {
    let flags = [];
    if (col.pk) flags.push('PK');
    if (col.fk) flags.push('FK');
    if (col.uk) flags.push('UK');
    const flagStr = flags.length ? ` [${flags.join(',')}]` : '';
    doc.text(`${col.nome}: ${col.tipo}${flagStr}`, x + 4, cy, { width: largura - 8 });
    cy += lineH;
  });

  if (extra) {
    doc.fillColor('#6b5d52').text(`+ ${tabela.colunas.length - 8} colunas...`, x + 4, cy);
  }

  return boxH;
}

function gerarPdf() {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4', bufferPages: true });
    const stream = fs.createWriteStream(OUTPUT);
    doc.pipe(stream);

    const dataGeracao = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date());

    // Capa
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#2c2419')
      .text('SysCedro', { align: 'center' });
    doc.fontSize(16).text('Arquitetura da Base de Dados', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11).fillColor('#6b5d52')
      .text('PostgreSQL — sys_cedro_wms', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(10).text(`Gerado em: ${dataGeracao}`, { align: 'center' });
    doc.moveDown(3);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#2c2419').text('Legenda');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor('#2c2419');
    doc.text('PK — Chave primária');
    doc.text('FK — Chave estrangeira (referência a outra tabela)');
    doc.text('UK — Restrição UNIQUE');
    doc.text('* — Tabela planejada para implementação futura');
    doc.moveDown(1.5);

    doc.font('Helvetica-Bold').fontSize(12).text('Módulos');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10);
    SCHEMA.modulos.forEach((mod) => {
      const tag = mod.planejado ? ' (planejado)' : '';
      doc.text(`• ${mod.nome}${tag}: ${mod.tabelas.join(', ')}`);
    });

    // Diagrama ER simplificado — página 2
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c2419')
      .text('Diagrama de Relacionamentos', 45, 45);
    doc.font('Helvetica').fontSize(9).fillColor('#6b5d52')
      .text('Visão simplificada das chaves primárias e estrangeiras', 45, 65);

    const diagramY = 85;
    const col1 = 45;
    const col2 = 215;
    const col3 = 385;

    const boxes = [
      [{ t: 'categorias', x: col1, y: diagramY }],
      [{ t: 'fornecedores', x: col2, y: diagramY }],
      [{ t: 'localizacoes', x: col3, y: diagramY }],
      [{ t: 'produtos', x: col1, y: diagramY + 130 }],
      [{ t: 'estoque', x: col2, y: diagramY + 130 }],
      [{ t: 'movimentacoes', x: col3, y: diagramY + 130 }],
      [{ t: 'clientes', x: col1, y: diagramY + 260 }],
      [{ t: 'orcamentos', x: col2, y: diagramY + 260 }],
      [{ t: 'orcamento_ambientes', x: col3, y: diagramY + 260 }],
      [{ t: 'orcamento_itens', x: col1, y: diagramY + 390 }],
      [{ t: 'vendedores', x: col2, y: diagramY + 390 }],
      [{ t: 'vendas', x: col3, y: diagramY + 390 }],
      [{ t: 'venda_itens', x: col2, y: diagramY + 520 }],
    ];

    const heights = {};
    boxes.flat().forEach(({ t, x, y }) => {
      heights[t] = drawTableBox(doc, x, y, t, SCHEMA.tabelas[t], 155);
    });

    // Setas simplificadas (linhas)
    doc.strokeColor('#c4a882').lineWidth(0.8);
    const links = [
      [col1 + 77, diagramY + 95, col1 + 77, diagramY + 130],
      [col2 + 77, diagramY + 95, col1 + 120, diagramY + 130],
      [col1 + 77, diagramY + 225, col2 + 40, diagramY + 130],
      [col3 + 77, diagramY + 95, col2 + 115, diagramY + 130],
      [col1 + 77, diagramY + 355, col2 + 77, diagramY + 260],
      [col2 + 77, diagramY + 355, col3 + 77, diagramY + 260],
      [col3 + 77, diagramY + 355, col1 + 120, diagramY + 390],
      [col2 + 77, diagramY + 485, col3 + 77, diagramY + 390],
      [col2 + 77, diagramY + 485, col2 + 77, diagramY + 520],
      [col3 + 77, diagramY + 485, col2 + 120, diagramY + 520],
    ];
    links.forEach(([x1, y1, x2, y2]) => {
      doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
    });

    // Página de relacionamentos detalhados
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c2419').text('Mapa de Chaves Estrangeiras');
    doc.moveDown(1);

    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Tabela origem', 45, y);
    doc.text('Coluna FK', 160, y);
    doc.text('Referência (PK)', 260, y);
    doc.text('Obs.', 400, y);
    y += 14;
    doc.moveTo(45, y).lineTo(550, y).strokeColor('#e0d8cf').stroke();
    y += 8;

    RELACIONAMENTOS.forEach((rel) => {
      y = ensureSpace(doc, y, 16);
      doc.font('Helvetica').fontSize(8).fillColor(rel.futuro ? '#b8860b' : '#2c2419');
      doc.text(rel.de, 45, y, { width: 110 });
      doc.text(rel.rotulo.split(' → ')[0], 160, y, { width: 95 });
      doc.text(rel.rotulo.split(' → ')[1] || rel.para, 260, y, { width: 130 });
      doc.text(rel.futuro ? 'Planejado' : rel.para, 400, y);
      y += 14;
    });

    // Detalhamento por tabela
    SCHEMA.modulos.forEach((modulo) => {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#2c2419')
        .text(`Módulo: ${modulo.nome}${modulo.planejado ? ' (planejado)' : ''}`);
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(9).fillColor('#6b5d52')
        .text(`Tabelas: ${modulo.tabelas.join(', ')}`);
      doc.moveDown(1);

      modulo.tabelas.forEach((nomeTabela) => {
        const tabela = SCHEMA.tabelas[nomeTabela];
        y = ensureSpace(doc, doc.y, 80);
        y = doc.y;

        doc.font('Helvetica-Bold').fontSize(11).fillColor(tabela.planejado ? '#b8860b' : '#8b5e3c')
          .text(`${nomeTabela}${tabela.planejado ? ' *' : ''}`, 45, y);
        y += 14;
        doc.font('Helvetica').fontSize(9).fillColor('#6b5d52').text(tabela.descricao, 45, y);
        y += 16;

        doc.font('Helvetica-Bold').fontSize(8).fillColor('#2c2419');
        doc.text('Coluna', 45, y);
        doc.text('Tipo', 170, y);
        doc.text('Chave', 300, y);
        doc.text('Referência', 380, y);
        y += 12;
        doc.moveTo(45, y).lineTo(550, y).stroke();
        y += 6;

        tabela.colunas.forEach((col) => {
          y = ensureSpace(doc, y, 14);
          let chave = [];
          if (col.pk) chave.push('PK');
          if (col.fk) chave.push('FK');
          if (col.uk) chave.push('UK');

          doc.font('Helvetica').fontSize(8).fillColor('#2c2419');
          doc.text(col.nome, 45, y, { width: 120 });
          doc.text(col.tipo, 170, y, { width: 120 });
          doc.text(chave.join(', ') || '—', 300, y, { width: 70 });
          doc.text(col.fk || '—', 380, y, { width: 165 });
          y += 12;
        });

        if (tabela.fks?.length) {
          y += 4;
          doc.font('Helvetica-Bold').fontSize(8).text('Relacionamentos:', 45, y);
          y += 10;
          tabela.fks.forEach((fk) => {
            y = ensureSpace(doc, y, 12);
            const del = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
            doc.font('Helvetica').fontSize(8).fillColor('#6b5d52')
              .text(`• ${fk.coluna} → ${fk.referencia}${del}`, 55, y);
            y += 11;
          });
        }

        if (tabela.unique?.length) {
          y += 2;
          doc.font('Helvetica-Bold').fontSize(8).text('Índices únicos:', 45, y);
          y += 10;
          tabela.unique.forEach((u) => {
            doc.font('Helvetica').fontSize(8).text(`• UNIQUE ${u}`, 55, y);
            y += 11;
          });
        }

        doc.y = y + 14;
      });
    });

    // Nota final sobre vendas
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).text('Notas sobre o módulo de Vendas (futuro)');
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(10);
    doc.text('As tabelas vendedores, vendas e venda_itens foram incluídas neste documento como proposta de evolução do schema. A integração prevista é:', { width: 500 });
    doc.moveDown(0.8);
    const notas = [
      'vendedores — cadastro da equipe comercial, referenciado em cada venda.',
      'vendas — pedido fechado vinculado a cliente, vendedor e opcionalmente ao orçamento de origem.',
      'venda_itens — produtos vendidos; ao confirmar venda, pode disparar movimentação de saída no estoque.',
      'orcamento_id em vendas — permite converter orçamento aprovado em venda mantendo rastreabilidade.',
    ];
    notas.forEach((n) => {
      doc.text(`• ${n}`, { width: 500 });
      doc.moveDown(0.4);
    });

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7).fillColor('#9a8f84')
        .text(`SysCedro — Arquitetura BD — Página ${i + 1} de ${pages.count}`, 45, doc.page.height - 35, {
          align: 'center',
          width: doc.page.width - 90,
        });
    }

    doc.end();
    stream.on('finish', () => resolve(OUTPUT));
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

gerarPdf()
  .then((file) => {
    console.log('PDF gerado com sucesso:', file);
  })
  .catch((err) => {
    console.error('Erro ao gerar PDF:', err);
    process.exit(1);
  });
