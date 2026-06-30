const fs = require('fs');
const PDFDocument = require('pdfkit');
const { getVenda } = require('./vendas');
const { listAlteracoesVenda } = require('./vendaEdicao');
const {
  PAGE_MARGIN,
  CONTENT_WIDTH,
  formatCurrency,
  formatDateTime,
  setPdfHeaderVariant,
  setPdfHeaderMeta,
  drawPdfHeader,
  drawSectionTitle,
  drawMetaGrid,
  drawTextBlock,
  finalizePdf,
  BRAND,
} = require('./pdfBrand');

async function gerarPdfAlteracaoVenda(filePath, vendaId) {
  const venda = await getVenda(vendaId);
  if (!venda) throw new Error('Venda não encontrada.');

  const alteracoes = await listAlteracoesVenda(vendaId);
  const ultima = alteracoes[0];
  if (!ultima) throw new Error('Nenhuma alteração registrada para esta venda.');

  const headerMeta = {
    subtitle: 'Comprovante de alteração',
    docTitle: venda.numero_pedido ? `Pedido ${venda.numero_pedido}` : venda.numero,
  };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
    doc._cedroPageBottomY = {};
    doc._cedroPageHasBody = {};
    setPdfHeaderVariant(doc, 'print');
    setPdfHeaderMeta(doc, headerMeta);

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    try {
      let y = drawPdfHeader(doc, { ...headerMeta, variant: 'print' });

      y = drawMetaGrid(doc, y, [
        { label: 'Venda', value: venda.numero },
        { label: 'Pedido', value: venda.numero_pedido || '—' },
        { label: 'Cliente', value: venda.cliente_nome },
        { label: 'Emitido em', value: formatDateTime(new Date()) },
        { label: 'Valor atual do pedido', value: formatCurrency(venda.total) },
        { label: 'Registrado por', value: ultima.usuario_nome || '—' },
      ]);

      y = drawSectionTitle(doc, 'Última alteração', y);
      y = drawTextBlock(doc, y, ultima.descricao, { bold: true });
      y += 4;
      y = drawTextBlock(doc, y, `Justificativa: ${ultima.motivo}`, { bold: true });

      if (ultima.valor_anterior != null && ultima.valor_novo != null) {
        y += 8;
        doc.font('Helvetica').fontSize(10).fillColor(BRAND.colors.text);
        doc.text(
          `Valor anterior: ${formatCurrency(ultima.valor_anterior)}   →   Novo valor: ${formatCurrency(ultima.valor_novo)}`,
          PAGE_MARGIN,
          y
        );
        y += 20;
      }

      if (alteracoes.length > 1) {
        y = drawSectionTitle(doc, 'Histórico de alterações', y);
        alteracoes.slice(0, 10).forEach((alt) => {
          y = drawTextBlock(
            doc,
            y,
            `${formatDateTime(alt.criado_em)} — ${alt.descricao}\nMotivo: ${alt.motivo}`,
            { fontSize: 9 }
          );
          y += 4;
        });
      }

      if (venda.nota_alteracao) {
        y = drawSectionTitle(doc, 'Nota do pedido', y);
        drawTextBlock(doc, y, venda.nota_alteracao, { bold: true });
      }

      finalizePdf(doc);
    } catch (error) {
      doc.destroy();
      reject(error);
      return;
    }

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

module.exports = { gerarPdfAlteracaoVenda };
