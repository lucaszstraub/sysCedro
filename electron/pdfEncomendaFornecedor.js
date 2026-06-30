const fs = require('fs');
const { getEncomendaFornecedor } = require('./encomendas');
const {
  BRAND,
  PAGE_MARGIN,
  CONTENT_WIDTH,
  formatCurrency,
  formatDate,
  setPdfHeaderVariant,
  setPdfHeaderMeta,
  createPdfDocument,
  drawPdfHeader,
  drawSectionTitle,
  drawMetaPanel,
  drawObservations,
  ensureSpace,
  finalizePdf,
  markPageBody,
} = require('./pdfBrand');

const LINE_HEIGHT = 11;
const SPEC_LINE_HEIGHT = 10.5;
const TEXT_WIDTH = CONTENT_WIDTH - 24;
const ITEM_PAD = 10;

function formatDestino(item) {
  if (item.destino_esperado === 'estoque') return 'Depósito';
  const numero = item.numero_pedido || item.venda_numero;
  if (numero) return `Pedido de cliente número: ${numero}`;
  return 'Pedido de cliente número: —';
}

function formatPrazoItem(item) {
  const dias = Number(item.previsao_entrega_dias);
  const partes = [];
  if (dias > 0) partes.push(`${dias} dias`);
  if (item.previsao_entrega) {
    partes.push(`entrega até ${formatDate(item.previsao_entrega)}`);
  }
  if (partes.length === 0) return '—';
  return partes.join(' · ');
}

const AVISO_NOTA_FISCAL = 'IMPORTANTE: Por favor, sinalizar na nota fiscal de cada mercadoria o destino do item conforme indicado neste documento ("Pedido de cliente número: …" ou "Depósito").';

function hasValue(value) {
  return value != null && String(value).trim() !== '';
}

function montarDetalhesFabricacao(item) {
  const detalhes = [];
  const nomeProduto = (item.produto_nome || '').trim();
  const descricaoVenda = (item.item_venda_descricao || '').trim();
  const descricaoProduto = (item.produto_descricao || '').trim();

  if (descricaoVenda && descricaoVenda !== nomeProduto) {
    detalhes.push(`Descrição do pedido: ${descricaoVenda}`);
  }

  const dimensoes = [];
  if (hasValue(item.produto_largura_cm)) dimensoes.push(`L ${item.produto_largura_cm} cm`);
  if (hasValue(item.produto_profundidade_cm)) dimensoes.push(`P ${item.produto_profundidade_cm} cm`);
  if (hasValue(item.produto_altura_cm)) dimensoes.push(`A ${item.produto_altura_cm} cm`);
  if (dimensoes.length > 0) {
    detalhes.push(`Dimensões: ${dimensoes.join(' × ')}`);
  }

  if (hasValue(item.produto_material)) {
    detalhes.push(`Material / tecido: ${String(item.produto_material).trim()}`);
  }
  if (hasValue(item.produto_cor)) {
    detalhes.push(`Cor: ${String(item.produto_cor).trim()}`);
  }
  if (hasValue(item.produto_peso_kg)) {
    detalhes.push(`Peso: ${item.produto_peso_kg} kg`);
  }

  if (descricaoProduto && descricaoProduto !== descricaoVenda && descricaoProduto !== nomeProduto) {
    detalhes.push(`Especificações: ${descricaoProduto}`);
  }

  return detalhes;
}

function wrapTextLines(doc, text, width) {
  const lines = [];
  String(text || '').split('\n').forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      return;
    }
    let current = '';
    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (doc.widthOfString(candidate) <= width) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
  });
  return lines;
}

function layoutItemContent(doc, item) {
  const qty = Number(item.quantidade_pedida) || 0;
  const unit = Number(item.custo_negociado) || 0;
  const lineTotal = Math.round(qty * unit * 100) / 100;
  const destino = formatDestino(item);
  const prazo = formatPrazoItem(item);
  const obs = (item.observacoes || '').trim();

  doc.font('Helvetica-Bold').fontSize(9);
  const title = item.produto_sku
    ? `${item.produto_sku} — ${item.produto_nome || ''}`
    : (item.produto_nome || '—');
  const titleLines = wrapTextLines(doc, title, TEXT_WIDTH);

  doc.font('Helvetica').fontSize(8.5);
  const specLines = montarDetalhesFabricacao(item).flatMap(
    (detalhe) => wrapTextLines(doc, detalhe, TEXT_WIDTH)
  );

  const detailLines = [
    ...wrapTextLines(doc, `Qtd: ${qty}   ·   Destino: ${destino}`, TEXT_WIDTH),
    ...wrapTextLines(doc, `Prazo acordado: ${prazo}`, TEXT_WIDTH),
    ...wrapTextLines(
      doc,
      `Valor negociado com o representante: ${formatCurrency(unit)}   ·   Total: ${formatCurrency(lineTotal)}`,
      TEXT_WIDTH
    ),
  ];

  const obsLines = obs
    ? wrapTextLines(doc, `Obs.: ${obs}`, TEXT_WIDTH)
    : [];

  return { titleLines, specLines, detailLines, obsLines };
}

function measureItemRowHeight(doc, layout) {
  let height = ITEM_PAD;
  height += layout.titleLines.length * LINE_HEIGHT + 4;
  if (layout.specLines.length > 0) {
    height += layout.specLines.length * SPEC_LINE_HEIGHT + 4;
  }
  height += layout.detailLines.length * LINE_HEIGHT + 4;
  if (layout.obsLines.length > 0) {
    height += layout.obsLines.length * LINE_HEIGHT + 2;
  }
  height += ITEM_PAD;
  return Math.max(height, 34);
}

function drawEncomendaItemRow(doc, y, item) {
  const layout = layoutItemContent(doc, item);
  const rowH = measureItemRowHeight(doc, layout);

  y = ensureSpace(doc, y, rowH + 8);
  markPageBody(doc);

  const innerX = PAGE_MARGIN + ITEM_PAD;
  let innerY = y + ITEM_PAD;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.colors.ink);
  layout.titleLines.forEach((line) => {
    doc.text(line, innerX, innerY, { lineBreak: false });
    innerY += LINE_HEIGHT;
  });
  innerY += 4;

  if (layout.specLines.length > 0) {
    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.colors.text);
    layout.specLines.forEach((line) => {
      doc.text(line, innerX, innerY, { lineBreak: false });
      innerY += SPEC_LINE_HEIGHT;
    });
    innerY += 4;
  }

  doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.colors.text);
  layout.detailLines.forEach((line) => {
    doc.text(line, innerX, innerY, { lineBreak: false });
    innerY += LINE_HEIGHT;
  });
  innerY += 4;

  if (layout.obsLines.length > 0) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.colors.text);
    layout.obsLines.forEach((line) => {
      doc.text(line, innerX, innerY, { lineBreak: false });
      innerY += LINE_HEIGHT;
    });
  }

  const boxBottom = y + rowH;
  doc.moveTo(PAGE_MARGIN, boxBottom)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, boxBottom)
    .strokeColor(BRAND.colors.border)
    .lineWidth(0.5)
    .stroke();

  return boxBottom + 8;
}

function drawFornecedorBlock(doc, y, data) {
  const lines = [];
  if (data.fornecedor_email) lines.push(`E-mail: ${data.fornecedor_email}`);
  if (data.fornecedor_telefone) lines.push(`Telefone: ${data.fornecedor_telefone}`);
  const panelH = 12 + 14 + (lines.length > 0 ? lines.length * 12 + 6 : 0) + 10;

  y = ensureSpace(doc, y, panelH + 20);
  y = drawSectionTitle(doc, 'Fornecedor', y);
  markPageBody(doc);

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, panelH, 6)
    .fillAndStroke(BRAND.colors.white, BRAND.colors.border);
  doc.restore();

  let innerY = y + 12;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.colors.ink)
    .text(data.fornecedor_nome || '—', PAGE_MARGIN + 14, innerY, { lineBreak: false });
  innerY += 16;
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.colors.muted);
  lines.forEach((line) => {
    doc.text(line, PAGE_MARGIN + 14, innerY, { lineBreak: false });
    innerY += 12;
  });

  return y + panelH + 12;
}

function drawAvisoNotaFiscal(doc, y) {
  doc.font('Helvetica-Bold').fontSize(8.5);
  const lines = wrapTextLines(doc, AVISO_NOTA_FISCAL, TEXT_WIDTH);
  const boxH = 16 + lines.length * 12 + 14;

  y = ensureSpace(doc, y, boxH + 12);
  markPageBody(doc);

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, boxH, 6)
    .fillAndStroke('#FFF8E6', BRAND.colors.gold);
  doc.restore();

  let innerY = y + 12;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#5C3D00');
  lines.forEach((line) => {
    doc.text(line, PAGE_MARGIN + 12, innerY, { lineBreak: false });
    innerY += 12;
  });

  return y + boxH + 14;
}

async function gerarPdfEncomendaFornecedor(filePath, encomendaId) {
  const data = await getEncomendaFornecedor(encomendaId);
  if (!data) throw new Error('Encomenda não encontrada.');

  const totalNegociado = (data.itens || []).reduce((sum, item) => {
    const qty = Number(item.quantidade_pedida) || 0;
    const unit = Number(item.custo_negociado) || 0;
    return sum + qty * unit;
  }, 0);

  return new Promise((resolve, reject) => {
    const doc = createPdfDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    try {
      const headerMeta = {
        subtitle: 'Pedido ao fornecedor',
        docTitle: data.numero,
      };
      setPdfHeaderVariant(doc, 'print');
      setPdfHeaderMeta(doc, headerMeta);
      let y = drawPdfHeader(doc, headerMeta);

      const metaItems = [
        { label: 'Data do pedido', value: data.data_pedido ? formatDate(data.data_pedido) : '—' },
      ];
      y = drawMetaPanel(doc, y, metaItems);
      y = drawAvisoNotaFiscal(doc, y);
      y = drawFornecedorBlock(doc, y, data);

      y = drawSectionTitle(doc, 'Itens do pedido', y);
      if (!data.itens?.length) {
        doc.font('Helvetica').fontSize(9).fillColor(BRAND.colors.muted)
          .text('Nenhum item cadastrado nesta encomenda.', PAGE_MARGIN, y, { lineBreak: false });
        y += 20;
      } else {
        data.itens.forEach((item) => {
          y = drawEncomendaItemRow(doc, y, item);
        });
      }

      y = ensureSpace(doc, y, 52);
      markPageBody(doc);
      const totalLabel = `Total: ${formatCurrency(totalNegociado)}`;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.colors.ink)
        .text(totalLabel, PAGE_MARGIN + CONTENT_WIDTH - doc.widthOfString(totalLabel), y, { lineBreak: false });
      y += 24;

      y = drawObservations(doc, y, data.observacoes);
      finalizePdf(doc);
    } catch (err) {
      doc.destroy();
      reject(err);
      return;
    }

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

module.exports = { gerarPdfEncomendaFornecedor };
