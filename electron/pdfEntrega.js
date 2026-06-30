const fs = require('fs');
const PDFDocument = require('pdfkit');
const { getDadosTicketEntrega } = require('./entregas');
const {
  BRAND,
  PAGE_MARGIN,
  CONTENT_WIDTH,
  formatDate,
  formatDateTime,
  ensureSpace,
  setPdfHeaderVariant,
  setPdfHeaderMeta,
  drawPdfHeader,
  drawSectionTitle,
  drawMetaGrid,
  drawObservations,
  drawDeliveryReceiptBlock,
  finalizePdf,
  drawAttentionBanner,
} = require('./pdfBrand');

function resolverItensTicket(data) {
  return (data.itens || [])
    .map((item) => {
      const pendente = Number(item.pendente_entrega) || 0;
      const qtdExibir = pendente > 0
        ? pendente
        : Number(item.quantidade_entregue) || Number(item.quantidade) || 0;
      return { ...item, qtd_exibir: qtdExibir };
    })
    .filter((item) => item.qtd_exibir > 0);
}

function calcularQuantidadeItensEntrega(data, itensTicket, consignadosTicket) {
  const itens = itensTicket.reduce((sum, item) => sum + item.qtd_exibir, 0);
  const consignados = (consignadosTicket || []).reduce(
    (sum, item) => sum + (Number(item.quantidade) || 0),
    0
  );
  const total = itens + consignados;
  if (total > 0) return total;

  const pendente = Number(data.total_pendente) || 0;
  if (pendente > 0) return pendente;
  return Number(data.total_entregue) || Number(data.total_itens) || 0;
}

function calcularVolumesTicket(data, itensTicket, consignadosTicket) {
  const volumesItens = itensTicket.reduce(
    (sum, item) => sum + item.qtd_exibir * Math.max(1, Number(item.volumes_por_unidade) || 1),
    0
  );
  const volumesConsignados = (consignadosTicket || []).reduce(
    (sum, item) => sum + (Number(item.quantidade) || 0) * Math.max(1, Number(item.volumes_por_unidade) || 1),
    0
  );
  const total = volumesItens + volumesConsignados;
  if (total > 0) return total;
  return Number(data.quantidade_volumes) || Number(data.volumes_calculados) || 1;
}

async function gerarPdfEntrega(filePath, entregaId) {
  const data = await getDadosTicketEntrega(entregaId);
  if (!data) throw new Error('Entrega não encontrada.');

  const itensTicket = resolverItensTicket(data);
  const consignadosTicket = (data.itens_consignados || []).filter((item) => Number(item.quantidade) > 0);
  const quantidadeItens = calcularQuantidadeItensEntrega(data, itensTicket, consignadosTicket);
  const quantidadeVolumes = calcularVolumesTicket(data, itensTicket, consignadosTicket);

  const endereco = [
    data.endereco_entrega || data.cliente_endereco,
    data.cidade_entrega || data.cliente_cidade,
    data.estado_entrega || data.cliente_estado,
    data.cep_entrega || data.cliente_cep,
  ].filter(Boolean).join(' — ');

  const headerMeta = {
    subtitle: 'Ticket de entrega',
    docTitle: data.numero_pedido ? `Pedido ${data.numero_pedido}` : data.numero,
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

      if (data.tem_a_receber) {
        y = drawAttentionBanner(doc, y, {
          title: 'ATENÇÃO — SALDO A RECEBER',
          message: 'Este pedido possui pagamento pendente. Confirme o recebimento antes ou durante a entrega.',
          value: data.valor_a_receber,
        });
      }

      y = drawMetaGrid(doc, y, [
        { label: 'Venda', value: data.venda_numero || '—' },
        { label: 'Entrega', value: data.numero },
        { label: 'Emitido em', value: formatDateTime(new Date()) },
        { label: 'Previsão', value: data.data_prevista ? formatDate(data.data_prevista) : '—' },
        { label: 'Quantidade de itens', value: String(quantidadeItens) },
        { label: 'Número de volumes', value: String(quantidadeVolumes) },
      ]);

      y = drawSectionTitle(doc, 'Cliente', y);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.colors.text).text(data.cliente_nome, PAGE_MARGIN, y);
      y += 16;
      doc.font('Helvetica').fontSize(9).fillColor(BRAND.colors.muted);
      if (data.cliente_cpf_cnpj) { doc.text(`CPF/CNPJ: ${data.cliente_cpf_cnpj}`, PAGE_MARGIN, y); y += 13; }
      if (data.cliente_telefone) { doc.text(`Telefone: ${data.cliente_telefone}`, PAGE_MARGIN, y); y += 13; }
      if (endereco) { doc.text(`Endereço: ${endereco}`, PAGE_MARGIN, y, { width: CONTENT_WIDTH }); y += 20; }

      y = drawSectionTitle(doc, 'Produtos', y);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.colors.muted);
      doc.text('Descrição', PAGE_MARGIN, y);
      doc.text('Qtd', PAGE_MARGIN + CONTENT_WIDTH - 40, y);
      y += 14;
      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor(BRAND.colors.border).stroke();
      y += 8;

      doc.font('Helvetica').fontSize(9.5).fillColor(BRAND.colors.text);
      itensTicket.forEach((item) => {
        y = ensureSpace(doc, y, 20);
        const desc = item.produto_sku ? `${item.produto_sku} — ${item.descricao}` : item.descricao;
        doc.text(desc, PAGE_MARGIN, y, { width: CONTENT_WIDTH - 50 });
        doc.text(String(item.qtd_exibir), PAGE_MARGIN + CONTENT_WIDTH - 40, y);
        y += 16;
      });

      if (consignadosTicket.length > 0) {
        y += 8;
        y = drawSectionTitle(doc, 'Produtos consignados', y);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.colors.muted);
        doc.text('Descrição', PAGE_MARGIN, y);
        doc.text('Qtd', PAGE_MARGIN + CONTENT_WIDTH - 40, y);
        y += 14;
        doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor(BRAND.colors.border).stroke();
        y += 8;

        doc.font('Helvetica').fontSize(9.5).fillColor(BRAND.colors.text);
        consignadosTicket.forEach((item) => {
          y = ensureSpace(doc, y, 20);
          const desc = item.produto_sku ? `${item.produto_sku} — ${item.descricao}` : item.descricao;
          doc.text(desc, PAGE_MARGIN, y, { width: CONTENT_WIDTH - 50 });
          doc.text(String(item.quantidade), PAGE_MARGIN + CONTENT_WIDTH - 40, y);
          y += 16;
        });
      }

      y += 10;
      if (data.venda_observacoes) {
        y = drawObservations(doc, y, data.venda_observacoes);
      }
      if (data.observacoes) {
        y = drawObservations(doc, y, data.observacoes, 'Observações da entrega');
      }

      y += 12;
      drawDeliveryReceiptBlock(doc, y);

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

module.exports = { gerarPdfEntrega };
