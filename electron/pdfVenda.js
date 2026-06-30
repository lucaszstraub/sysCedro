const fs = require('fs');
const { getVenda } = require('./vendas');
const { getPdfImagePath } = require('./images');
const {
  formatDateTime,
  setPdfHeaderVariant,
  setPdfHeaderMeta,
  createPdfDocument,
  drawPdfHeader,
  drawSectionTitle,
  drawMetaPanel,
  drawClientBlock,
  drawCatalogItemCard,
  drawTotalsBlock,
  drawPagamentosValor,
  drawObservations,
  finalizePdf,
} = require('./pdfBrand');

const ENTREGA_LABEL = {
  parcial: 'Parcial — liberar conforme disponibilidade',
  completa: 'Completa — aguardar todos os produtos',
};

function montarTituloItem(item) {
  if (item.produto_sku) {
    return `${item.produto_sku} — ${item.descricao}`;
  }
  return item.descricao;
}

function montarSubtituloItem(item) {
  const partes = [];
  const qEstoque = item.quantidade_estoque;
  const qEncomenda = item.quantidade_encomenda;
  if (qEstoque != null || qEncomenda != null) {
    partes.push(`Estoque: ${Number(qEstoque) || 0} · Encomenda: ${Number(qEncomenda) || 0}`);
  }
  return partes.join(' · ') || null;
}

async function gerarPdfVenda(filePath, vendaId) {
  const data = await getVenda(vendaId);
  if (!data) throw new Error('Venda não encontrada.');

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
          subtitle: 'Pedido de venda',
          docTitle: data.numero,
        };
        setPdfHeaderVariant(doc, 'print');
        setPdfHeaderMeta(doc, headerMeta);
        let y = drawPdfHeader(doc, headerMeta);

        const metaItems = [
          { label: 'Emitido em', value: formatDateTime(data.criado_em) },
          { label: 'Nº pedido', value: data.numero_pedido || '—' },
        ];
        if (data.orcamento_numero) {
          metaItems.push({ label: 'Orçamento origem', value: data.orcamento_numero });
        }
        if (data.vendedor_nome) {
          metaItems.push({ label: 'Vendedor', value: data.vendedor_nome });
        }
        if (data.entrega_tipo_liberacao) {
          metaItems.push({
            label: 'Liberação de entrega',
            value: ENTREGA_LABEL[data.entrega_tipo_liberacao] || data.entrega_tipo_liberacao,
          });
        }
        y = drawMetaPanel(doc, y, metaItems);

        y = drawClientBlock(doc, y, data);

        for (const ambiente of data.ambientes) {
          y = drawSectionTitle(doc, ambiente.nome, y);

          for (const item of ambiente.itens) {
            const imagePath = await resolveImage(item.produto_foto_path);
            const qty = Number(item.quantidade) || 0;
            const precoLista = Number(item.preco_unitario_lista ?? item.preco_unitario) || 0;
            const precoFinal = Number(item.preco_unitario) || 0;
            const subtotalFinal = item.subtotal != null
              ? Number(item.subtotal)
              : qty * precoFinal;
            const subtotalLista = Math.round(qty * precoLista * 100) / 100;
            y = drawCatalogItemCard(doc, y, {
              title: montarTituloItem(item),
              subtitle: montarSubtituloItem(item),
              observacao: item.observacoes,
              imagePath,
              quantidade: item.quantidade,
              precoUnitario: precoFinal,
              precoUnitarioLista: precoLista,
              subtotal: subtotalFinal,
              subtotalLista,
            });
          }
          y += 4;
        }

        const subtotalBruto = Number(data.subtotal_bruto ?? data.subtotal) || 0;
        const desconto = Number(data.desconto_extra ?? data.desconto) || 0;
        const total = Number(data.total_pago ?? data.total) || 0;

        y = drawTotalsBlock(doc, y, {
          subtotal: subtotalBruto,
          desconto,
          total,
          subtotalLabel: 'Subtotal dos produtos',
        });

        y = drawPagamentosValor(doc, y, data.pagamentos || []);
        y = drawObservations(doc, y, data.observacoes);
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

module.exports = { gerarPdfVenda };
