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

const DESCONTO_PADRAO = 8;
const DIMENSAO_EXPOSTA = 'Peça Exposta';

function round2(n) {
  return Math.round(n * 100) / 100;
}

function calcularPrecos(valorPrazo, descontoPct = DESCONTO_PADRAO) {
  const prazo = Math.max(Number(valorPrazo) || 0, 0);
  const desconto = Math.min(Math.max(Number(descontoPct) ?? DESCONTO_PADRAO, 0), 100);
  return {
    valor_prazo: prazo,
    desconto_pct: desconto,
    valor_vista: round2(prazo * (1 - desconto / 100)),
    parcela_1mais9: round2(prazo / 10),
  };
}

function normalizarEtiqueta(data) {
  const precos = calcularPrecos(data?.valor_prazo ?? data?.preco_venda, data?.desconto_pct);
  return {
    sku: data?.sku || '',
    nome: String(data?.nome || '—').trim(),
    tamanho: data?.tamanho?.trim() || DIMENSAO_EXPOSTA,
    acabamento: data?.acabamento ? String(data.acabamento).trim() : '',
    ...precos,
  };
}

function drawEtiquetaContent(doc, rawData, width, height) {
  const data = normalizarEtiqueta(rawData);
  const pad = Math.max(8, width * 0.05);
  const innerW = width - pad * 2;
  const scale = width / (50 * MM);

  doc.save();
  doc.rect(0, 0, width, height).fill(BRAND.colors.cream);
  doc.restore();

  doc.save();
  doc.lineWidth(0.6).strokeColor(BRAND.colors.gold);
  doc.roundedRect(pad * 0.5, pad * 0.5, width - pad, height - pad, 3 * scale).stroke();
  doc.restore();

  let y = pad + 4 * scale;

  const logoPath = getLogoPath('dark') || getLogoPath('gold');
  const logoW = Math.min(innerW * 0.32, 34 * scale);
  const logoAreaH = 13 * scale;
  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, (width - logoW) / 2, y + 1 * scale, { width: logoW });
    y += logoAreaH + 8 * scale;
  } else {
    doc.font('Helvetica-Bold').fontSize(5 * scale).fillColor(BRAND.colors.espresso);
    doc.text('CEDRO MÓVEIS', pad, y, { width: innerW, align: 'center' });
    y += logoAreaH + 6 * scale;
  }

  y += 2 * scale;

  doc.font('Helvetica-Bold').fontSize(8.8 * scale).fillColor(BRAND.colors.espresso);
  const nomeH = doc.heightOfString(data.nome, {
    width: innerW - 4,
    align: 'center',
    lineGap: 0.5,
  });
  doc.text(data.nome, pad + 2, y, {
    width: innerW - 4,
    align: 'center',
    lineGap: 0.5,
  });
  y += nomeH + 5 * scale;

  const drawLinha = (texto, fontSize = 7 * scale) => {
    if (!texto) return;
    doc.font('Helvetica').fontSize(fontSize).fillColor(BRAND.colors.charcoal);
    const h = doc.heightOfString(texto, { width: innerW - 6, align: 'center', lineGap: 0.3 });
    doc.text(texto, pad + 3, y, { width: innerW - 6, align: 'center', lineGap: 0.3 });
    y += h + 3 * scale;
  };

  drawLinha(data.tamanho);
  drawLinha(data.acabamento);

  const footerH = 48 * scale;
  const footerY = height - pad - footerH;
  const footerX = pad + 1;
  const footerW = innerW - 2;

  doc.save();
  doc.lineWidth(0.5).strokeColor(BRAND.colors.gold);
  doc.fillColor('#faf7f3');
  doc.roundedRect(footerX, footerY, footerW, footerH, 2.5 * scale).fillAndStroke();
  doc.restore();

  const vistaH = 24 * scale;
  doc.font('Helvetica').fontSize(5 * scale).fillColor(BRAND.colors.gold);
  doc.text('À VISTA', footerX, footerY + 4 * scale, {
    width: footerW,
    align: 'center',
    characterSpacing: 0.8,
  });

  doc.font('Helvetica-Bold').fontSize(11.5 * scale).fillColor(BRAND.colors.espresso);
  doc.text(formatCurrency(data.valor_vista), footerX, footerY + 10 * scale, {
    width: footerW,
    align: 'center',
  });

  const divY = footerY + vistaH;
  doc.save();
  doc.strokeColor(BRAND.colors.sand).lineWidth(0.4);
  doc.moveTo(footerX + 8 * scale, divY).lineTo(footerX + footerW - 8 * scale, divY).stroke();
  doc.restore();

  const prazoY = divY + 3 * scale;
  doc.font('Helvetica').fontSize(4.8 * scale).fillColor('#8a755f');
  doc.text('À PRAZO', footerX, prazoY, {
    width: footerW,
    align: 'center',
    characterSpacing: 0.6,
  });

  doc.font('Helvetica-Bold').fontSize(8 * scale).fillColor(BRAND.colors.charcoal);
  doc.text(formatCurrency(data.valor_prazo), footerX, prazoY + 6 * scale, {
    width: footerW,
    align: 'center',
  });

  doc.font('Helvetica').fontSize(5 * scale).fillColor('#6b5c52');
  doc.text(`1+9x de ${formatCurrency(data.parcela_1mais9)}`, footerX, prazoY + 16 * scale, {
    width: footerW,
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

  const copias = Math.min(Math.max(Number(data.copias) || LABELS_PER_PAGE, 1), LABELS_PER_PAGE);
  const etiqueta = normalizarEtiqueta(data);
  const etiquetas = Array.from({ length: copias }, () => ({ ...etiqueta }));

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
