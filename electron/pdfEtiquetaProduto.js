const fs = require('fs');
const PDFDocument = require('pdfkit');
const { formatCurrency } = require('./pdfBrand');

const MM = 2.834645669291;

/** Tamanho da etiqueta térmica (adesivo sobre a etiqueta física do móvel). */
const THERMAL_WIDTH_MM = 50;
const THERMAL_HEIGHT_MM = 40;

const THERMAL_WIDTH = THERMAL_WIDTH_MM * MM;
const THERMAL_HEIGHT = THERMAL_HEIGHT_MM * MM;

const DESCONTO_PADRAO = 8;
const DIMENSAO_EXPOSTA = 'Peça Exposta';

const C = {
  ink: '#000000',
  body: '#222222',
  muted: '#444444',
  light: '#666666',
  rule: '#cccccc',
  white: '#ffffff',
};

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

function mm(value) {
  return value * MM;
}

function drawThermalEtiqueta(doc, rawData) {
  const data = normalizarEtiqueta(rawData);
  const pad = mm(2.2);
  const innerW = THERMAL_WIDTH - pad * 2;
  let y = pad;

  doc.rect(0, 0, THERMAL_WIDTH, THERMAL_HEIGHT).fill(C.white);

  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.ink);
  const nomeH = doc.heightOfString(data.nome, { width: innerW, lineGap: -0.5 });
  const maxNomeH = mm(7.5);
  doc.text(data.nome, pad, y, {
    width: innerW,
    lineGap: -0.5,
    height: Math.min(nomeH, maxNomeH),
    ellipsis: true,
  });
  y += Math.min(nomeH, maxNomeH) + mm(0.6);

  if (data.sku) {
    doc.font('Helvetica').fontSize(5).fillColor(C.light);
    doc.text(data.sku, pad, y, { width: innerW });
    y += mm(2.8);
  }

  doc.font('Helvetica').fontSize(5.5).fillColor(C.muted);
  doc.text(data.tamanho, pad, y, { width: innerW });
  y += mm(3.2);

  if (data.acabamento) {
    doc.font('Helvetica').fontSize(5).fillColor(C.light);
    const acabH = doc.heightOfString(data.acabamento, { width: innerW, lineGap: -0.3 });
    doc.text(data.acabamento, pad, y, {
      width: innerW,
      lineGap: -0.3,
      height: Math.min(acabH, mm(5)),
      ellipsis: true,
    });
    y += Math.min(acabH, mm(5)) + mm(0.5);
  }

  y += mm(0.8);
  doc.save();
  doc.strokeColor(C.rule).lineWidth(0.35);
  doc.moveTo(pad, y).lineTo(THERMAL_WIDTH - pad, y).stroke();
  doc.restore();
  y += mm(1.8);

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink);
  doc.text(formatCurrency(data.valor_vista), pad, y, { width: innerW });
  y += mm(3.2);

  doc.font('Helvetica').fontSize(4.8).fillColor(C.light);
  doc.text('à vista', pad, y, { width: innerW });
  y += mm(3.6);

  doc.font('Helvetica').fontSize(6.2).fillColor(C.body);
  doc.text(formatCurrency(data.valor_prazo), pad, y, { width: innerW });
  y += mm(2.8);

  doc.font('Helvetica').fontSize(4.8).fillColor(C.light);
  doc.text(`1+9x de ${formatCurrency(data.parcela_1mais9)}`, pad, y, { width: innerW });
}

async function gerarPdfFolhasEtiquetas(filePath, etiquetas) {
  const list = Array.isArray(etiquetas) ? etiquetas : [];
  if (!list.length) throw new Error('Nenhuma etiqueta na seleção.');

  list.forEach((item, index) => {
    if (!item?.nome?.trim()) throw new Error(`Etiqueta ${index + 1}: informe o nome do produto.`);
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      margin: 0,
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);

    try {
      list.forEach((item) => {
        doc.addPage({
          size: [THERMAL_WIDTH, THERMAL_HEIGHT],
          margin: 0,
        });
        drawThermalEtiqueta(doc, item);
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function gerarPdfEtiquetaProduto(filePath, data) {
  if (!data?.nome) throw new Error('Informe o nome do produto na etiqueta.');

  const copias = Math.min(Math.max(Number(data.copias) || 1, 1), 999);
  const etiqueta = normalizarEtiqueta(data);
  const etiquetas = Array.from({ length: copias }, () => ({ ...etiqueta }));

  return gerarPdfFolhasEtiquetas(filePath, etiquetas);
}

module.exports = {
  gerarPdfEtiquetaProduto,
  gerarPdfFolhasEtiquetas,
  normalizarEtiqueta,
  THERMAL_WIDTH_MM,
  THERMAL_HEIGHT_MM,
  THERMAL_WIDTH,
  THERMAL_HEIGHT,
};
