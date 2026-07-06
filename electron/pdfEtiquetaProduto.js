const fs = require('fs');
const PDFDocument = require('pdfkit');
const { BRAND, getLogoPath, formatCurrency } = require('./pdfBrand');

const MM = 2.834645669291;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

const PAGE_MARGIN = 10 * MM;
const GUTTER = 3 * MM;
const COLS = 2;
const ROWS = 3;
const LABELS_PER_PAGE = COLS * ROWS;

const LABEL_WIDTH = (A4_WIDTH - PAGE_MARGIN * 2 - GUTTER * (COLS - 1)) / COLS;
const LABEL_HEIGHT = (A4_HEIGHT - PAGE_MARGIN * 2 - GUTTER * (ROWS - 1)) / ROWS;

function drawDivider(doc, y, pad, width, color = BRAND.colors.gold) {
  const x1 = pad + 6;
  const x2 = width - pad - 6;
  doc.save();
  doc.lineWidth(0.5).strokeColor(color);
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
  doc.restore();
}

function drawEtiquetaContent(doc, data, width, height) {
  const pad = Math.max(10, width * 0.042);
  const innerW = width - pad * 2;
  const scale = width / (50 * MM);

  doc.save();
  doc.rect(0, 0, width, height).fill(BRAND.colors.cream);
  doc.restore();

  doc.save();
  doc.lineWidth(0.8).strokeColor(BRAND.colors.gold);
  doc.roundedRect(pad * 0.55, pad * 0.55, width - pad * 1.1, height - pad * 1.1, 4 * scale).stroke();
  doc.lineWidth(0.25).strokeColor(BRAND.colors.sand);
  doc.roundedRect(pad, pad, width - pad * 2, height - pad * 2, 2.5 * scale).stroke();
  doc.restore();

  let y = pad + 8 * scale;

  const logoPath = getLogoPath('dark') || getLogoPath('gold');
  const logoW = Math.min(innerW * 0.72, 78 * scale);
  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, (width - logoW) / 2, y, { width: logoW });
    y += logoW * 0.42 + 6 * scale;
  } else {
    doc.font('Helvetica-Bold').fontSize(7 * scale).fillColor(BRAND.colors.espresso);
    doc.text('CEDRO MÓVEIS & AMBIENTES', pad, y, { width: innerW, align: 'center' });
    y += 12 * scale;
  }

  doc.font('Helvetica-Bold').fontSize(7.5 * scale).fillColor(BRAND.colors.gold);
  doc.text(String(data.sku || '').toUpperCase(), pad, y, {
    width: innerW,
    align: 'center',
    characterSpacing: 1.4,
  });
  y += 13 * scale;

  drawDivider(doc, y, pad, width);
  y += 10 * scale;

  doc.font('Helvetica-Bold').fontSize(11.5 * scale).fillColor(BRAND.colors.espresso);
  const nomeH = doc.heightOfString(data.nome || '—', {
    width: innerW - 10,
    align: 'center',
    lineGap: 1,
  });
  doc.text(data.nome || '—', pad + 5, y, {
    width: innerW - 10,
    align: 'center',
    lineGap: 1,
  });
  y += nomeH + 10 * scale;

  const drawSpec = (label, value) => {
    if (!value) return;
    doc.font('Helvetica-Bold').fontSize(5.8 * scale).fillColor(BRAND.colors.gold);
    doc.text(label, pad + 4, y, { width: innerW - 8, align: 'center', characterSpacing: 0.8 });
    y += 8 * scale;
    doc.font('Helvetica').fontSize(8 * scale).fillColor(BRAND.colors.charcoal);
    const h = doc.heightOfString(value, { width: innerW - 14, align: 'center', lineGap: 0.5 });
    doc.text(value, pad + 7, y, { width: innerW - 14, align: 'center', lineGap: 0.5 });
    y += h + 8 * scale;
  };

  drawSpec('TAMANHO', data.tamanho);
  drawSpec('ACABAMENTO', data.acabamento);

  const priceBoxH = 40 * scale;
  const priceY = height - pad - priceBoxH - 4 * scale;
  doc.save();
  doc.fillColor(BRAND.colors.espresso);
  doc.roundedRect(pad + 2, priceY, innerW - 4, priceBoxH, 3 * scale).fill();
  doc.restore();

  doc.font('Helvetica').fontSize(5.8 * scale).fillColor(BRAND.colors.gold);
  doc.text('INVESTIMENTO', pad + 2, priceY + 8 * scale, {
    width: innerW - 4,
    align: 'center',
    characterSpacing: 1,
  });

  doc.font('Helvetica-Bold').fontSize(16 * scale).fillColor(BRAND.colors.white);
  doc.text(formatCurrency(data.preco_venda), pad + 2, priceY + 20 * scale, {
    width: innerW - 4,
    align: 'center',
  });
}

function labelPosition(index) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: PAGE_MARGIN + col * (LABEL_WIDTH + GUTTER),
    y: PAGE_MARGIN + row * (LABEL_HEIGHT + GUTTER),
  };
}

function drawEtiquetaAt(doc, data, index) {
  const { x, y } = labelPosition(index);
  doc.save();
  doc.translate(x, y);
  drawEtiquetaContent(doc, data, LABEL_WIDTH, LABEL_HEIGHT);
  doc.restore();
}

function drawSheetGuides(doc) {
  doc.save();
  doc.strokeColor('#e8e0d6').lineWidth(0.35).dash(2, { space: 3 });
  for (let c = 1; c < COLS; c += 1) {
    const x = PAGE_MARGIN + c * LABEL_WIDTH + (c - 0.5) * GUTTER;
    doc.moveTo(x, PAGE_MARGIN - 2).lineTo(x, A4_HEIGHT - PAGE_MARGIN + 2).stroke();
  }
  for (let r = 1; r < ROWS; r += 1) {
    const y = PAGE_MARGIN + r * LABEL_HEIGHT + (r - 0.5) * GUTTER;
    doc.moveTo(PAGE_MARGIN - 2, y).lineTo(A4_WIDTH - PAGE_MARGIN + 2, y).stroke();
  }
  doc.undash();
  doc.restore();
}

async function gerarPdfFolhasEtiquetas(filePath, etiquetas) {
  const list = Array.isArray(etiquetas) ? etiquetas : [];
  if (!list.length) throw new Error('Nenhuma etiqueta na seleção.');

  list.forEach((item, index) => {
    if (!item?.nome?.trim()) throw new Error(`Etiqueta ${index + 1}: informe o nome do produto.`);
    if (!item?.sku) throw new Error(`Etiqueta ${index + 1}: SKU não encontrado.`);
  });

  const totalPages = Math.ceil(list.length / LABELS_PER_PAGE);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: false,
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);

    try {
      for (let page = 0; page < totalPages; page += 1) {
        doc.addPage({ size: 'A4', margin: 0 });
        doc.save();
        doc.rect(0, 0, A4_WIDTH, A4_HEIGHT).fill(BRAND.colors.white);
        doc.restore();

        const start = page * LABELS_PER_PAGE;
        const end = Math.min(start + LABELS_PER_PAGE, list.length);
        for (let i = start; i < end; i += 1) {
          drawEtiquetaAt(doc, list[i], i - start);
        }

        drawSheetGuides(doc);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function gerarPdfEtiquetaProduto(filePath, data) {
  if (!data?.nome) throw new Error('Informe o nome do produto na etiqueta.');
  if (!data?.sku) throw new Error('SKU do produto não encontrado.');

  const copias = Math.min(Math.max(Number(data.copias) || LABELS_PER_PAGE, 1), LABELS_PER_PAGE);
  const etiquetas = Array.from({ length: copias }, () => ({
    sku: data.sku,
    nome: data.nome,
    tamanho: data.tamanho || null,
    acabamento: data.acabamento || null,
    preco_venda: data.preco_venda,
  }));

  return gerarPdfFolhasEtiquetas(filePath, etiquetas);
}

module.exports = {
  gerarPdfEtiquetaProduto,
  gerarPdfFolhasEtiquetas,
  LABEL_WIDTH,
  LABEL_HEIGHT,
  LABELS_PER_PAGE,
  A4_WIDTH,
  A4_HEIGHT,
};
