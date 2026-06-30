const fs = require('fs');
const { getOrcamento } = require('./orcamentos');
const { getPdfImagePath } = require('./images');
const {
  formatDate,
  formatDateTime,
  setPdfHeaderMeta,
  setPdfHeaderVariant,
  createPdfDocument,
  drawPdfHeader,
  drawSectionTitle,
  drawMetaPanel,
  drawClientBlock,
  drawCatalogItemCard,
  drawTotalsBlock,
  drawPaymentForms,
  drawPagamentosValor,
  drawObservations,
  finalizePdf,
} = require('./pdfBrand');

function isPagamentoComValor(formas) {
  return formas?.length && formas[0].valor != null && formas[0].desconto_percentual == null;
}

function montarTituloItem(item) {
  if (item.produto_sku) {
    return `${item.produto_sku} — ${item.descricao}`;
  }
  return item.descricao;
}

function montarSubtituloItem(item) {
  return null;
}

async function gerarPdfOrcamento(filePath, orcamentoId) {
  const data = await getOrcamento(orcamentoId);
  if (!data) throw new Error('Orçamento não encontrado.');

  const imageCache = {};
  async function resolveImage(fotoPath) {
    const key = fotoPath || '__placeholder__';
    if (!imageCache[key]) {
      imageCache[key] = await getPdfImagePath(fotoPath);
    }
    return imageCache[key];
  }

  return new Promise((resolve, reject) => {
    const doc = createPdfDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    (async () => {
      try {
        const headerMeta = {
          variant: 'print',
          subtitle: 'Orçamento comercial',
          docTitle: data.numero,
        };
        setPdfHeaderVariant(doc, 'print');
        setPdfHeaderMeta(doc, headerMeta);
        let y = drawPdfHeader(doc, headerMeta);

        const metaItems = [
          { label: 'Emitido em', value: formatDateTime(data.criado_em) },
          {
            label: 'Validade',
            value: data.validade
              ? `Até ${formatDate(data.validade)}`
              : `${data.validade_dias || 30} dias`,
          },
        ];
        if (data.vendedor_nome) {
          metaItems.push({ label: 'Vendedor', value: data.vendedor_nome });
        }
        y = drawMetaPanel(doc, y, metaItems);

        y = drawClientBlock(doc, y, data);

        for (const ambiente of data.ambientes) {
          y = drawSectionTitle(doc, ambiente.nome, y);

          for (const item of ambiente.itens) {
            const imagePath = await resolveImage(item.produto_foto_path);
            y = drawCatalogItemCard(doc, y, {
              title: montarTituloItem(item),
              subtitle: montarSubtituloItem(item),
              observacao: item.observacoes,
              imagePath,
              quantidade: item.quantidade,
              precoUnitario: item.preco_unitario,
              subtotal: item.subtotal,
            });
          }
          y += 4;
        }

        y = drawTotalsBlock(doc, y, {
          subtotal: data.subtotal,
          desconto: Number(data.desconto) || 0,
          total: data.total,
          subtotalLabel: 'Subtotal dos itens',
        });

        if (isPagamentoComValor(data.formas_pagamento)) {
          y = drawPagamentosValor(doc, y, data.formas_pagamento);
        } else {
          y = drawPaymentForms(doc, y, data.subtotal, data.formas_pagamento || []);
        }
        drawObservations(doc, y, data.observacoes);
        finalizePdf(doc);
      } catch (err) {
        doc.destroy();
        reject(err);
      }
    })();

    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

module.exports = { gerarPdfOrcamento };
