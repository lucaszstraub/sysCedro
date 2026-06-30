const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const BRAND = {
  name: 'Cedro Móveis & Ambientes',
  system: 'SysCedro',
  colors: {
    espresso: '#2b1a14',
    brown: '#4a2e1f',
    cream: '#f3efea',
    sand: '#d6c8b8',
    charcoal: '#2e2e2e',
    gold: '#b89b5e',
    olive: '#4f5b3a',
    slate: '#1f3a3d',
    ink: '#2b1a14',
    text: '#2b1a14',
    muted: '#4a2e1f',
    accent: '#b89b5e',
    accentSoft: '#d6c8b8',
    border: '#d6c8b8',
    paper: '#f3efea',
    white: '#ffffff',
  },
};

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 495;
const FOOTER_ZONE_TOP = 60;

function getCurrentPageIndex(doc) {
  const range = doc.bufferedPageRange();
  return range.start + range.count - 1;
}

function recordContentBottom(doc, bottomY) {
  if (!doc._cedroPageBottomY) doc._cedroPageBottomY = {};
  const pageIndex = getCurrentPageIndex(doc);
  const value = Number(bottomY) || 0;
  doc._cedroPageBottomY[pageIndex] = Math.max(doc._cedroPageBottomY[pageIndex] || 0, value);
}

function pageContentBottom(doc) {
  return doc.page.height - PAGE_MARGIN - FOOTER_ZONE_TOP;
}

function safeText(doc, text, x, y, options = {}) {
  const fontSize = doc._fontSize || 12;
  const lineHeight = options.lineHeight || fontSize * 1.2;
  const { width, align, ...rest } = options;
  doc.text(String(text ?? ''), x, y, { lineBreak: false, ...rest });
  recordContentBottom(doc, y + lineHeight);
}

function markPageBody(doc) {
  if (!doc._cedroPageHasBody) doc._cedroPageHasBody = {};
  doc._cedroPageHasBody[getCurrentPageIndex(doc)] = true;
}

function safeImage(doc, path, x, y, options = {}) {
  const height = options.height || options.width || 50;
  if (y + height > pageContentBottom(doc) + 1) {
    throw new Error('Imagem fora da área útil da página. Ajuste o layout do PDF.');
  }
  doc.image(path, x, y, options);
  recordContentBottom(doc, y + height);
}

function getLogoPath(preferred = 'gold') {
  const preference = {
    gold: ['logo-padrao.png', 'logo-branca.png'],
    white: ['logo-branca.png', 'logo-padrao.png'],
    dark: ['logo-preta.png'],
  };
  const fileNames = preference[preferred] || preference.gold;
  const dirs = [
    path.join(__dirname, '..', 'assets', 'brand'),
    path.join(__dirname, '..', 'public', 'brand'),
  ];
  for (const dir of dirs) {
    for (const name of fileNames) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(dateStr));
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dateStr));
}

function getPdfHeaderVariant(doc) {
  return doc._cedroHeaderVariant || 'dark';
}

function setPdfHeaderVariant(doc, variant) {
  doc._cedroHeaderVariant = variant;
}

function setPdfHeaderMeta(doc, meta = {}) {
  doc._cedroHeaderMeta = meta;
}

function ensureSpace(doc, y, needed = 40) {
  if (y + needed <= pageContentBottom(doc)) return y;
  doc.addPage();
  const newY = drawPdfHeader(doc, {
    continued: true,
    variant: getPdfHeaderVariant(doc),
    ...(doc._cedroHeaderMeta || {}),
  });
  return newY;
}

function wrapTextLines(doc, text, width) {
  const lines = [];
  String(text).split('\n').forEach((paragraph) => {
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

function isObservacaoLabel(label) {
  return /observa/i.test(String(label || ''));
}

function drawTextBlock(doc, y, text, { fontSize = 9.5, lineGap = 3, color = BRAND.colors.text, bold = false } = {}) {
  const lineHeight = fontSize + lineGap;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(color);
  const lines = wrapTextLines(doc, text, CONTENT_WIDTH);
  lines.forEach((line) => {
    y = ensureSpace(doc, y, lineHeight);
    markPageBody(doc);
    safeText(doc, line, PAGE_MARGIN, y, { lineHeight });
    y += lineHeight;
  });
  return y;
}

function drawPdfHeaderPrint(doc, { subtitle, docTitle, continued = false } = {}) {
  let y = PAGE_MARGIN;

  const logoPath = getLogoPath('dark');
  const logoH = 46;
  if (logoPath) {
    safeImage(doc, logoPath, PAGE_MARGIN, y, { height: logoH });
  } else {
    doc.fillColor(BRAND.colors.ink).font('Helvetica-Bold').fontSize(18);
    safeText(doc, 'cedro', PAGE_MARGIN, y + 8);
    doc.font('Helvetica').fontSize(7).fillColor(BRAND.colors.muted).letterSpacing(1.5);
    safeText(doc, 'MÓVEIS & AMBIENTES', PAGE_MARGIN, y + 30);
  }

  const rightEdge = PAGE_MARGIN + CONTENT_WIDTH;
  if (subtitle) {
    doc.fillColor(BRAND.colors.muted).font('Helvetica').fontSize(8);
    const subtitleText = subtitle.toUpperCase();
    safeText(doc, subtitleText, rightEdge - doc.widthOfString(subtitleText), y + 2);
  }
  if (docTitle) {
    doc.fillColor(BRAND.colors.ink).font('Helvetica-Bold').fontSize(13);
    safeText(doc, docTitle, rightEdge - doc.widthOfString(docTitle), y + 20);
  }

  y += logoH + 10;
  if (!continued) {
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
      .strokeColor(BRAND.colors.border).lineWidth(1).stroke();
    y += 14;
  } else {
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
      .strokeColor(BRAND.colors.border).lineWidth(0.5).stroke();
    y += 12;
  }

  recordContentBottom(doc, y);
  return y;
}

function drawPdfHeader(doc, { subtitle, docTitle, continued = false, variant } = {}) {
  const style = variant || getPdfHeaderVariant(doc);
  if (style === 'print') {
    return drawPdfHeaderPrint(doc, { subtitle, docTitle, continued });
  }

  const pageWidth = doc.page.width;

  doc.save();
  doc.rect(0, 0, pageWidth, 96).fill('#000000');

  const logoPath = getLogoPath('gold');
  if (logoPath) {
    safeImage(doc, logoPath, PAGE_MARGIN, 16, { height: 58 });
  } else {
    doc.fillColor(BRAND.colors.cream).font('Helvetica-Bold').fontSize(20);
    safeText(doc, 'cedro', PAGE_MARGIN, 30);
    doc.font('Helvetica').fontSize(7).letterSpacing(2);
    safeText(doc, 'MÓVEIS & AMBIENTES', PAGE_MARGIN, 54);
  }

  const rightEdge = pageWidth - PAGE_MARGIN;
  if (subtitle) {
    doc.fillColor(BRAND.colors.gold).font('Helvetica').fontSize(8.5);
    const subtitleText = subtitle.toUpperCase();
    safeText(doc, subtitleText, rightEdge - doc.widthOfString(subtitleText), 28);
  }
  if (docTitle) {
    doc.fillColor(BRAND.colors.cream).font('Helvetica-Bold').fontSize(12);
    safeText(doc, docTitle, rightEdge - doc.widthOfString(docTitle), 46);
  }
  doc.restore();

  if (!continued) {
    doc.rect(0, 96, pageWidth, 4).fill(BRAND.colors.gold);
  }

  recordContentBottom(doc, 112);
  return 112;
}

function drawPdfFooter(doc) {
  const pageWidth = doc.page.width;
  const footerY = doc.page.height - 42;
  const labelY = footerY + 8;
  doc.save();
  doc.moveTo(PAGE_MARGIN, footerY).lineTo(pageWidth - PAGE_MARGIN, footerY)
    .strokeColor(BRAND.colors.border).lineWidth(0.5).stroke();
  doc.fontSize(7.5).font('Helvetica').fillColor(BRAND.colors.muted);
  doc.text(BRAND.name, PAGE_MARGIN, labelY, { lineBreak: false });
  const rightLabel = `Gerado por ${BRAND.system}`;
  const rightWidth = doc.widthOfString(rightLabel);
  doc.text(rightLabel, pageWidth - PAGE_MARGIN - rightWidth, labelY, { lineBreak: false });
  doc.restore();
}

function pageHasContent(doc, pageIndex) {
  const bodies = doc._cedroPageHasBody || {};
  return !!bodies[pageIndex];
}

function drawSectionTitle(doc, title, y) {
  markPageBody(doc);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BRAND.colors.ink);
  safeText(doc, title.toUpperCase(), PAGE_MARGIN, y, {
    characterSpacing: 0.6,
    lineHeight: 12,
  });
  const lineY = y + 15;
  doc.moveTo(PAGE_MARGIN, lineY).lineTo(PAGE_MARGIN + CONTENT_WIDTH, lineY)
    .strokeColor(BRAND.colors.accent).lineWidth(1.2).stroke();
  recordContentBottom(doc, lineY + 14);
  return lineY + 14;
}

function drawMetaGrid(doc, y, items, insetX = PAGE_MARGIN) {
  const colWidth = CONTENT_WIDTH / 2;
  let rowY = y;
  items.forEach((item, index) => {
    const col = index % 2;
    const x = insetX + col * colWidth;
    if (col === 0 && index > 0) rowY += 28;
    doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.colors.muted);
    safeText(doc, item.label.toUpperCase(), x, rowY, { lineHeight: 9 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(BRAND.colors.text);
    safeText(doc, item.value, x, rowY + 11, { lineHeight: 11 });
  });
  const rows = Math.ceil(items.length / 2);
  return y + rows * 28 + 8;
}

function drawMetaPanel(doc, y, items) {
  const rows = Math.ceil(items.length / 2);
  const panelH = rows * 28 + 20;
  y = ensureSpace(doc, y, panelH + 10);
  markPageBody(doc);
  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, panelH, 6)
    .fillAndStroke(BRAND.colors.paper, BRAND.colors.border);
  doc.restore();
  recordContentBottom(doc, y + panelH);
  const innerY = drawMetaGrid(doc, y + 10, items, PAGE_MARGIN + 4);
  return innerY + 4;
}

function buildClientFieldRows(data) {
  const cidadeUf = [data.cliente_cidade, data.cliente_estado].filter(Boolean).join(' — ');
  const rows = [
    { label: 'CPF/CNPJ', value: data.cliente_cpf_cnpj || '—', span: 1 },
    { label: 'Telefone', value: data.cliente_telefone || '—', span: 1 },
    { label: 'E-mail', value: data.cliente_email || '—', span: 1 },
    { label: 'CEP', value: data.cliente_cep || '—', span: 1 },
    { label: 'Endereço', value: data.cliente_endereco || '—', span: 2 },
    { label: 'Cidade / UF', value: cidadeUf || '—', span: 2 },
  ];

  const observacoes = (data.cliente_observacoes || '').trim();
  if (observacoes) {
    rows.push({ label: 'Observações do cadastro', value: observacoes, span: 2 });
  }

  return rows;
}

function measureFieldHeight(doc, field, width) {
  const isObservacao = isObservacaoLabel(field.label);
  doc.font(isObservacao ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
  const valueLines = wrapTextLines(doc, field.value, width);
  return 11 + valueLines.length * 13 + 8;
}

function measureClientBlockHeight(doc, data, textWidth, colWidth) {
  doc.font('Helvetica-Bold').fontSize(11);
  const nameLines = wrapTextLines(doc, data.cliente_nome || '—', textWidth);
  let height = 12 + nameLines.length * 14 + 8;

  let col = 0;
  let rowHeight = 0;
  buildClientFieldRows(data).forEach((field) => {
    const width = field.span === 2 ? textWidth : colWidth;
    const fieldHeight = measureFieldHeight(doc, field, width);
    if (field.span === 2) {
      height += (col === 1 ? rowHeight : 0) + fieldHeight;
      col = 0;
      rowHeight = 0;
      return;
    }
    if (col === 0) {
      rowHeight = fieldHeight;
      col = 1;
      return;
    }
    height += Math.max(rowHeight, fieldHeight);
    col = 0;
    rowHeight = 0;
  });
  if (col === 1) height += rowHeight;

  return height + 14;
}

function drawClientField(doc, x, y, field, width) {
  const isObservacao = isObservacaoLabel(field.label);
  doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.colors.muted);
  safeText(doc, field.label.toUpperCase(), x, y, { lineHeight: 9 });
  doc.font(isObservacao ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(BRAND.colors.text);
  const valueLines = wrapTextLines(doc, field.value, width);
  let valueY = y + 11;
  valueLines.forEach((line) => {
    safeText(doc, line, x, valueY, { lineHeight: 13 });
    valueY += 13;
  });
  return valueY + 8 - y;
}

function drawClientBlock(doc, y, data) {
  const innerX = PAGE_MARGIN + 14;
  const textWidth = CONTENT_WIDTH - 28;
  const colWidth = (textWidth - 12) / 2;
  const panelH = measureClientBlockHeight(doc, data, textWidth, colWidth);

  y = ensureSpace(doc, y, 30 + panelH + 8);
  y = drawSectionTitle(doc, 'Cliente', y);
  markPageBody(doc);

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, panelH, 6)
    .fillAndStroke(BRAND.colors.white, BRAND.colors.border);
  doc.restore();
  recordContentBottom(doc, y + panelH);

  let innerY = y + 12;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.colors.ink);
  wrapTextLines(doc, data.cliente_nome || '—', textWidth).forEach((line) => {
    safeText(doc, line, innerX, innerY, { lineHeight: 14 });
    innerY += 14;
  });
  innerY += 8;

  let col = 0;
  let rowStartY = innerY;
  let rowHeight = 0;

  buildClientFieldRows(data).forEach((field) => {
    if (field.span === 2 && col === 1) {
      innerY = rowStartY + rowHeight;
      rowStartY = innerY;
      col = 0;
      rowHeight = 0;
    }

    const fieldX = field.span === 2 ? innerX : innerX + col * (colWidth + 12);
    const fieldWidth = field.span === 2 ? textWidth : colWidth;
    const fieldHeight = drawClientField(doc, fieldX, innerY, field, fieldWidth);

    if (field.span === 2) {
      innerY = innerY + fieldHeight;
      rowStartY = innerY;
      col = 0;
      rowHeight = 0;
      return;
    }

    if (col === 0) {
      rowHeight = fieldHeight;
      col = 1;
      return;
    }

    innerY = rowStartY + Math.max(rowHeight, fieldHeight);
    rowStartY = innerY;
    col = 0;
    rowHeight = 0;
  });

  return y + panelH + 12;
}

function drawCatalogItemCard(doc, y, {
  title,
  subtitle,
  observacao,
  imagePath,
  quantidade,
  precoUnitario,
  precoUnitarioLista,
  subtotal,
  subtotalLista,
}) {
  const pad = 12;
  const imgSize = 64;
  const textX = PAGE_MARGIN + pad + imgSize + 14;
  const textWidth = CONTENT_WIDTH - pad * 2 - imgSize - 14;
  const qty = Number(quantidade) || 0;
  const precoFinal = Number(precoUnitario) || 0;
  const precoLista = precoUnitarioLista != null ? Number(precoUnitarioLista) : precoFinal;
  const subFinal = Number(subtotal) || qty * precoFinal;
  const subLista = subtotalLista != null
    ? Number(subtotalLista)
    : Math.round(qty * precoLista * 100) / 100;
  const exibirDuploPreco = Math.abs(precoLista - precoFinal) > 0.005
    || Math.abs(subLista - subFinal) > 0.005;
  const footerH = exibirDuploPreco ? 36 : 20;
  const titleLineH = 12;
  const subtitleLineH = 10;
  const observacaoLineH = 10;

  doc.font('Helvetica-Bold').fontSize(10);
  const titleLines = wrapTextLines(doc, title || '—', textWidth);
  let subtitleLines = [];
  if (subtitle) {
    doc.font('Helvetica').fontSize(8);
    subtitleLines = wrapTextLines(doc, subtitle, textWidth);
  }
  let observacaoLines = [];
  const observacaoTexto = (observacao || '').trim();
  if (observacaoTexto) {
    doc.font('Helvetica-Bold').fontSize(8);
    observacaoLines = wrapTextLines(doc, observacaoTexto, textWidth);
  }
  const titleH = titleLines.length * titleLineH;
  const subtitleH = subtitleLines.length > 0 ? subtitleLines.length * subtitleLineH + 6 : 0;
  const observacaoH = observacaoLines.length > 0 ? observacaoLines.length * observacaoLineH + 6 : 0;
  const bodyH = Math.max(imgSize, titleH + subtitleH + observacaoH);
  const cardH = pad + bodyH + footerH + pad;

  y = ensureSpace(doc, y, cardH + 10);
  markPageBody(doc);
  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, cardH, 6)
    .fillAndStroke(BRAND.colors.white, BRAND.colors.border);
  doc.restore();
  recordContentBottom(doc, y + cardH);

  const imgY = y + pad + Math.max(0, (bodyH - imgSize) / 2);
  if (imagePath) {
    safeImage(doc, imagePath, PAGE_MARGIN + pad, imgY, { width: imgSize, height: imgSize, fit: [imgSize, imgSize] });
  } else {
    doc.save();
    doc.roundedRect(PAGE_MARGIN + pad, imgY, imgSize, imgSize, 4)
      .fillAndStroke(BRAND.colors.paper, BRAND.colors.border);
    doc.restore();
    recordContentBottom(doc, imgY + imgSize);
  }

  let textY = y + pad;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.colors.ink);
  titleLines.forEach((line) => {
    safeText(doc, line, textX, textY, { lineHeight: titleLineH });
    textY += titleLineH;
  });
  if (subtitleLines.length > 0) {
    textY += 4;
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.colors.muted);
    subtitleLines.forEach((line) => {
      safeText(doc, line, textX, textY, { lineHeight: subtitleLineH });
      textY += subtitleLineH;
    });
  }
  if (observacaoLines.length > 0) {
    textY += 4;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.colors.text);
    observacaoLines.forEach((line) => {
      safeText(doc, line, textX, textY, { lineHeight: observacaoLineH });
      textY += observacaoLineH;
    });
  }

  const colLeft = PAGE_MARGIN + pad;
  const colRight = PAGE_MARGIN + Math.round(CONTENT_WIDTH / 2) + 6;
  let valuesY = y + cardH - pad - (exibirDuploPreco ? 30 : 12);

  doc.font('Helvetica').fontSize(8).fillColor(BRAND.colors.muted);
  safeText(doc, `Qtd: ${quantidade}`, colLeft, valuesY, { lineHeight: 10 });

  if (exibirDuploPreco) {
    valuesY += 11;
    safeText(doc, `Valor de tabela: ${formatCurrency(precoLista)}`, colLeft, valuesY, { lineHeight: 10 });
    doc.font('Helvetica-Bold').fillColor(BRAND.colors.ink);
    safeText(doc, `Valor final: ${formatCurrency(precoFinal)}`, colRight, valuesY, { lineHeight: 10 });
    valuesY += 11;
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.colors.muted);
    safeText(doc, `Subtotal de tabela: ${formatCurrency(subLista)}`, colLeft, valuesY, { lineHeight: 10 });
    doc.font('Helvetica-Bold').fillColor(BRAND.colors.accent);
    safeText(doc, `Subtotal final: ${formatCurrency(subFinal)}`, colRight, valuesY, { lineHeight: 10 });
  } else {
    safeText(doc, `Unitário: ${formatCurrency(precoFinal)}`, PAGE_MARGIN + pad + 72, valuesY, { lineHeight: 10 });
    doc.font('Helvetica-Bold').fillColor(BRAND.colors.accent);
    const subtotalLabel = `Subtotal: ${formatCurrency(subFinal)}`;
    safeText(
      doc,
      subtotalLabel,
      PAGE_MARGIN + CONTENT_WIDTH - pad - doc.widthOfString(subtotalLabel),
      valuesY,
      { lineHeight: 10 }
    );
  }

  return y + cardH + 10;
}

function drawSpecItemCard(doc, y, { title, specs, observacao, quantidade, precoUnitario, subtotal }) {
  const pad = 12;
  const titleLineH = 12;
  const specLineHeight = 9.5;
  const observacaoLineHeight = 9.5;
  const innerWidth = CONTENT_WIDTH - pad * 2;

  doc.font('Helvetica-Bold').fontSize(10);
  const titleLines = wrapTextLines(doc, title || '—', innerWidth);
  const titleH = titleLines.length * titleLineH;
  doc.font('Helvetica').fontSize(7.5);
  const specLines = specs ? wrapTextLines(doc, specs, innerWidth) : [];
  const specsH = specLines.length > 0 ? specLines.length * specLineHeight + 6 : 0;
  const observacaoTexto = (observacao || '').trim();
  let observacaoLines = [];
  if (observacaoTexto) {
    doc.font('Helvetica-Bold').fontSize(7.5);
    observacaoLines = wrapTextLines(doc, observacaoTexto, innerWidth);
  }
  const observacaoH = observacaoLines.length > 0 ? observacaoLines.length * observacaoLineHeight + 6 : 0;
  const cardH = pad + titleH + specsH + observacaoH + 22 + pad;

  y = ensureSpace(doc, y, cardH + 10);
  markPageBody(doc);
  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, cardH, 6)
    .fillAndStroke(BRAND.colors.white, BRAND.colors.border);
  doc.restore();
  recordContentBottom(doc, y + cardH);

  doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.colors.ink);
  titleLines.forEach((line, index) => {
    safeText(doc, line, PAGE_MARGIN + pad, y + pad + index * titleLineH, { lineHeight: titleLineH });
  });
  if (specLines.length > 0) {
    const specsY = y + pad + titleH + 4;
    doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.colors.muted);
    specLines.forEach((line, index) => {
      safeText(doc, line, PAGE_MARGIN + pad, specsY + index * specLineHeight, { lineHeight: specLineHeight });
    });
  }
  if (observacaoLines.length > 0) {
    const obsY = y + pad + titleH + specsH + 4;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.colors.text);
    observacaoLines.forEach((line, index) => {
      safeText(doc, line, PAGE_MARGIN + pad, obsY + index * observacaoLineHeight, { lineHeight: observacaoLineHeight });
    });
  }

  const valuesY = y + cardH - pad - 10;
  doc.font('Helvetica').fontSize(8).fillColor(BRAND.colors.muted);
  safeText(doc, `Qtd: ${quantidade}`, PAGE_MARGIN + pad, valuesY);
  safeText(doc, `Unitário: ${formatCurrency(precoUnitario)}`, PAGE_MARGIN + pad + 72, valuesY);
  doc.font('Helvetica-Bold').fillColor(BRAND.colors.accent);
  const subtotalLabel = `Subtotal: ${formatCurrency(subtotal)}`;
  safeText(
    doc,
    subtotalLabel,
    PAGE_MARGIN + CONTENT_WIDTH - pad - doc.widthOfString(subtotalLabel),
    valuesY,
    { lineHeight: 10 }
  );

  return y + cardH + 10;
}

function drawTotalsBlock(doc, y, { subtotal, desconto, total, subtotalLabel = 'Subtotal' }) {
  y = ensureSpace(doc, y, 80);
  markPageBody(doc);
  const boxX = PAGE_MARGIN + CONTENT_WIDTH - 230;
  const boxW = 230;
  doc.save();
  doc.roundedRect(boxX, y, boxW, desconto > 0.005 ? 72 : 52, 6)
    .fillAndStroke(BRAND.colors.paper, BRAND.colors.border);
  doc.restore();
  recordContentBottom(doc, y + (desconto > 0.005 ? 72 : 52));

  let innerY = y + 12;
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.colors.muted);
  safeText(doc, `${subtotalLabel}:`, boxX + 14, innerY, { lineHeight: 11 });
  doc.font('Helvetica-Bold').fillColor(BRAND.colors.text);
  const subtotalStr = formatCurrency(subtotal);
  safeText(doc, subtotalStr, boxX + boxW - 14 - doc.widthOfString(subtotalStr), innerY, { lineHeight: 11 });
  innerY += 16;
  if (desconto > 0.005) {
    doc.font('Helvetica').fillColor(BRAND.colors.muted);
    safeText(doc, 'Desconto extra:', boxX + 14, innerY, { lineHeight: 11 });
    doc.font('Helvetica-Bold').fillColor(BRAND.colors.accent);
    const descontoStr = `- ${formatCurrency(desconto)}`;
    safeText(doc, descontoStr, boxX + boxW - 14 - doc.widthOfString(descontoStr), innerY, { lineHeight: 11 });
    innerY += 16;
  }
  doc.moveTo(boxX + 14, innerY).lineTo(boxX + boxW - 14, innerY).strokeColor(BRAND.colors.border).stroke();
  innerY += 8;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.colors.ink);
  safeText(doc, 'Valor final:', boxX + 14, innerY, { lineHeight: 12 });
  doc.fontSize(11);
  const totalStr = formatCurrency(total);
  safeText(doc, totalStr, boxX + boxW - 14 - doc.widthOfString(totalStr), innerY, { lineHeight: 13 });
  return y + (desconto > 0.005 ? 88 : 68);
}

function drawPaymentForms(doc, y, subtotal, formas = []) {
  if (!formas.length) return y;
  y = ensureSpace(doc, y, 36);
  y = drawSectionTitle(doc, 'Condições de pagamento', y);
  formas.forEach((forma) => {
    y = ensureSpace(doc, y, 18);
    markPageBody(doc);
    const pct = Number(forma.desconto_percentual) || 0;
    const totalForma = subtotal - (subtotal * pct / 100);
    const descontoLabel = pct > 0 ? ` (${pct}% de desconto)` : '';
    const line = `• ${forma.nome}${descontoLabel}: ${formatCurrency(totalForma)}`;
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.colors.text);
    safeText(doc, line, PAGE_MARGIN + 4, y, { lineHeight: 12 });
    y += 14;
  });
  return y + 6;
}

function drawPagamentosValor(doc, y, pagamentos = []) {
  if (!pagamentos.length) return y;
  y = ensureSpace(doc, y, 36);
  y = drawSectionTitle(doc, 'Formas de pagamento', y);
  pagamentos.forEach((pag) => {
    y = ensureSpace(doc, y, 18);
    markPageBody(doc);
    const nome = pag.forma_nome || pag.nome || 'Pagamento';
    const parcelas = Number(pag.parcelas) > 1 ? ` (${pag.parcelas}x)` : '';
    const prefix = `• ${nome}${parcelas}: ${formatCurrency(pag.valor)}`;
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.colors.text);
    safeText(doc, prefix, PAGE_MARGIN + 4, y, { lineHeight: 12 });
    if (pag.observacao?.trim()) {
      doc.font('Helvetica-Bold');
      const obsText = ` — ${pag.observacao.trim()}`;
      safeText(doc, obsText, PAGE_MARGIN + 4 + doc.widthOfString(prefix), y, { lineHeight: 12 });
    }
    y += 14;
  });
  return y + 6;
}

function drawObservations(doc, y, text, title = 'Observações') {
  if (!text?.trim()) return y;
  y = ensureSpace(doc, y, 36);
  y = drawSectionTitle(doc, title, y);
  return drawTextBlock(doc, y, text, { bold: true }) + 8;
}

function drawAttentionBanner(doc, y, {
  title,
  message,
  value,
  valueLabel = 'Valor a receber',
} = {}) {
  const padX = 18;
  const padY = 14;
  const innerX = PAGE_MARGIN + padX;
  const innerW = CONTENT_WIDTH - padX * 2;
  const hasValue = value != null && Number(value) > 0;
  const valueStr = hasValue ? formatCurrency(value) : '';

  const titleFontSize = 13;
  const messageFontSize = 10;
  const valueLabelFontSize = 8.5;
  let valueFontSize = 18;

  doc.font('Helvetica-Bold').fontSize(titleFontSize);
  const titleH = doc.heightOfString(title || '', { width: innerW });

  doc.font('Helvetica').fontSize(messageFontSize);
  const messageH = message
    ? doc.heightOfString(message, { width: innerW })
    : 0;

  if (hasValue) {
    doc.font('Helvetica-Bold').fontSize(valueFontSize);
    while (valueFontSize > 12 && doc.widthOfString(valueStr) > innerW - 4) {
      valueFontSize -= 1;
      doc.fontSize(valueFontSize);
    }
  }

  const valueLabelH = hasValue ? valueLabelFontSize + 4 : 0;
  const valueH = hasValue ? valueFontSize * 1.2 : 0;
  const valueBlockH = hasValue ? valueLabelH + valueH + 6 : 0;

  const gapAfterTitle = 8;
  const gapAfterMessage = hasValue && message ? 10 : 0;
  const bannerH = padY
    + titleH
    + gapAfterTitle
    + messageH
    + gapAfterMessage
    + valueBlockH
    + padY;

  y = ensureSpace(doc, y, bannerH + 14);
  markPageBody(doc);

  const bg = '#fff3d4';
  const border = '#d4a017';
  const titleColor = '#5c3d00';
  const valueColor = '#8a5a00';

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, bannerH, 8)
    .fillAndStroke(bg, border);
  doc.lineWidth(2.5);
  doc.roundedRect(PAGE_MARGIN + 4, y + 4, CONTENT_WIDTH - 8, bannerH - 8, 6)
    .stroke(border);
  doc.restore();

  let innerY = y + padY;

  doc.font('Helvetica-Bold').fontSize(titleFontSize).fillColor(titleColor);
  doc.text(title || '', innerX, innerY, { width: innerW, lineBreak: true });
  innerY += titleH + gapAfterTitle;

  if (message) {
    doc.font('Helvetica').fontSize(messageFontSize).fillColor(titleColor);
    doc.text(message, innerX, innerY, { width: innerW, lineBreak: true });
    innerY += messageH + gapAfterMessage;
  }

  if (hasValue) {
    const valueBoxY = innerY;
    const valueBoxH = valueBlockH;
    doc.save();
    doc.roundedRect(innerX, valueBoxY, innerW, valueBoxH, 5)
      .fillAndStroke('#fff8e8', '#e8c96a');
    doc.restore();

    const valueInnerX = innerX + 10;
    const valueInnerW = innerW - 20;

    doc.font('Helvetica-Bold').fontSize(valueLabelFontSize).fillColor(BRAND.colors.muted);
    doc.text(valueLabel.toUpperCase(), valueInnerX, valueBoxY + 6, {
      width: valueInnerW,
      lineBreak: true,
    });

    doc.font('Helvetica-Bold').fontSize(valueFontSize).fillColor(valueColor);
    doc.text(valueStr, valueInnerX, valueBoxY + valueLabelH + 4, {
      width: valueInnerW,
      lineBreak: true,
    });
  }

  recordContentBottom(doc, y + bannerH);
  return y + bannerH + 14;
}

function drawSignatureLine(doc, label, y, { lineWidth = CONTENT_WIDTH, lineOffset = 28 } = {}) {
  doc.font('Helvetica').fontSize(10).fillColor(BRAND.colors.text);
  safeText(doc, label, PAGE_MARGIN, y, { lineHeight: 12 });
  const lineY = y + lineOffset;
  doc.moveTo(PAGE_MARGIN, lineY).lineTo(PAGE_MARGIN + lineWidth, lineY)
    .strokeColor(BRAND.colors.ink).lineWidth(0.8).stroke();
  recordContentBottom(doc, lineY + 8);
  return lineY + 18;
}

function drawDeliveryReceiptBlock(doc, y) {
  const blockHeight = 150;
  y = ensureSpace(doc, y, blockHeight + 16);
  y = drawSectionTitle(doc, 'Recebimento', y);
  y += 10;

  markPageBody(doc);
  y = drawSignatureLine(doc, 'Nome de quem recebe:', y, { lineOffset: 22 });
  y += 10;
  y = drawSignatureLine(doc, 'Assinatura:', y, { lineOffset: 36 });
  y += 8;

  const half = CONTENT_WIDTH / 2 - 8;
  doc.font('Helvetica').fontSize(10).fillColor(BRAND.colors.text);
  safeText(doc, 'Data:', PAGE_MARGIN, y, { lineHeight: 12 });
  safeText(doc, 'Hora:', PAGE_MARGIN + half + 16, y, { lineHeight: 12 });
  const lineY = y + 28;
  doc.moveTo(PAGE_MARGIN, lineY).lineTo(PAGE_MARGIN + half, lineY)
    .strokeColor(BRAND.colors.ink).lineWidth(0.8).stroke();
  doc.moveTo(PAGE_MARGIN + half + 16, lineY).lineTo(PAGE_MARGIN + CONTENT_WIDTH, lineY)
    .strokeColor(BRAND.colors.ink).lineWidth(0.8).stroke();
  recordContentBottom(doc, lineY + 12);
  return lineY + 24;
}

function finalizePdf(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    if (!pageHasContent(doc, i)) continue;
    doc.switchToPage(i);
    drawPdfFooter(doc);
  }
  doc.end();
}

function renderPdfToBuffer(renderContent) {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument();
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      renderContent(doc);
      finalizePdf(doc);
    } catch (err) {
      try { doc.destroy(); } catch (_) { /* ignore */ }
      reject(err);
    }
  });
}

function createPdfDocument() {
  const doc = new PDFDocument({
    margin: PAGE_MARGIN,
    size: 'A4',
    bufferPages: true,
    autoFirstPage: true,
  });
  doc._cedroPageBottomY = {};
  doc._cedroPageHasBody = {};
  return doc;
}

module.exports = {
  BRAND,
  PAGE_MARGIN,
  CONTENT_WIDTH,
  getLogoPath,
  formatCurrency,
  formatDate,
  formatDateTime,
  ensureSpace,
  setPdfHeaderVariant,
  getPdfHeaderVariant,
  setPdfHeaderMeta,
  createPdfDocument,
  drawPdfHeader,
  drawPdfFooter,
  drawSectionTitle,
  drawTextBlock,
  drawMetaGrid,
  drawMetaPanel,
  drawClientBlock,
  drawCatalogItemCard,
  drawSpecItemCard,
  drawTotalsBlock,
  drawPaymentForms,
  drawPagamentosValor,
  drawObservations,
  drawAttentionBanner,
  drawDeliveryReceiptBlock,
  finalizePdf,
  renderPdfToBuffer,
  markPageBody,
};
