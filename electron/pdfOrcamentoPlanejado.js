const fs = require('fs');
const { getOrcamentoPlanejado } = require('./orcamentosPlanejados');
const {
  formatDate,
  setPdfHeaderVariant,
  setPdfHeaderMeta,
  createPdfDocument,
  drawPdfHeader,
  drawSectionTitle,
  drawMetaPanel,
  drawClientBlock,
  drawSpecItemCard,
  drawTotalsBlock,
  drawPaymentForms,
  drawObservations,
  finalizePdf,
} = require('./pdfBrand');

const PRINT_HEADER = {
  variant: 'print',
  subtitle: 'Orçamento — Móveis planejados',
};

const TIPO_FUNDO_LABEL = {
  vazado: 'Vazado',
  grosso: 'Grosso',
  fino: 'Fino',
  com_manta_isolante: 'Com manta isolante',
};

const TIPO_PORTA_LABEL = {
  sem_porta: 'Sem porta',
  porta_correr: 'Porta de correr',
  porta_giro: 'Porta de giro',
};

const TIPO_PUXADOR_LABEL = {
  sem_puxador: 'Sem puxador',
  usinado: 'Usinado',
  versatille: 'Versatille',
  px_60: 'Px-60',
  roma_8015: 'Roma (8015)',
  sier_recorte_45: 'Sier (Recorte 45)',
  outro: 'Outro',
};

const TIPO_CORREDICAS_LABEL = {
  sem_corredicas: 'Sem corrediças',
  padrao: 'Padrão',
  invisiveis: 'Invisíveis',
};

function formatarPrazoEntrega(orcamento) {
  if (orcamento.prazo_entrega_outro) return orcamento.prazo_entrega_outro;
  const dias = orcamento.prazo_entrega_dias ?? 60;
  return `${dias} dias`;
}

function formatDim(value) {
  if (value == null || value === '') return '—';
  return `${value} cm`;
}

function formatarPuxador(item) {
  if (item.tipo_puxador === 'outro' && item.tipo_puxador_outro) {
    return item.tipo_puxador_outro;
  }
  return TIPO_PUXADOR_LABEL[item.tipo_puxador] || item.tipo_puxador;
}

function montarEspecificacoes(item) {
  return [
    `L ${formatDim(item.largura)} × P ${formatDim(item.profundidade)} × A ${formatDim(item.altura)}`,
    `MDF ${item.espessura_mdf || 18}mm${item.padrao_mdf ? ` — ${item.padrao_mdf}` : ''}`,
    `Fundo: ${TIPO_FUNDO_LABEL[item.tipo_fundo] || item.tipo_fundo}`,
    `Porta: ${TIPO_PORTA_LABEL[item.tipo_porta] || item.tipo_porta}`,
    `Puxador: ${formatarPuxador(item)}${item.cor_puxador ? ` (${item.cor_puxador})` : ''}`,
    `Corrediças: ${TIPO_CORREDICAS_LABEL[item.tipo_corredicas] || item.tipo_corredicas}`,
    item.canaleta_led ? 'Canaleta LED' : null,
    item.itens_extra ? `Extras: ${item.itens_extra}` : null,
  ].filter(Boolean).join('  ·  ');
}

function drawItemCard(doc, y, item) {
  return drawSpecItemCard(doc, y, {
    title: item.descricao,
    specs: montarEspecificacoes(item),
    observacao: item.observacoes,
    quantidade: item.quantidade,
    precoUnitario: item.preco_unitario,
    subtotal: item.subtotal,
  });
}

async function gerarPdfOrcamentoPlanejado(filePath, orcamentoId) {
  const data = await getOrcamentoPlanejado(orcamentoId);
  if (!data) throw new Error('Orçamento planejado não encontrado.');

  return new Promise((resolve, reject) => {
    const doc = createPdfDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    try {
      setPdfHeaderVariant(doc, 'print');
      const headerMeta = { ...PRINT_HEADER, docTitle: data.numero };
      setPdfHeaderMeta(doc, headerMeta);

      let y = drawPdfHeader(doc, headerMeta);

      const metaItems = [
        { label: 'Emitido em', value: formatDate(data.criado_em) },
        { label: 'Validade', value: data.validade ? `Até ${formatDate(data.validade)}` : `${data.validade_dias || 30} dias` },
        { label: 'Prazo de entrega', value: formatarPrazoEntrega(data) },
      ];
      if (data.vendedor_nome) {
        metaItems.push({ label: 'Vendedor', value: data.vendedor_nome });
      }
      y = drawMetaPanel(doc, y, metaItems);
      y += 2;

      y = drawClientBlock(doc, y, data);

      for (const ambiente of data.ambientes) {
        y = drawSectionTitle(doc, ambiente.nome, y);
        for (const item of ambiente.itens) {
          y = drawItemCard(doc, y, item);
        }
        y += 4;
      }

      y = drawTotalsBlock(doc, y, {
        subtotal: data.subtotal,
        desconto: 0,
        total: data.subtotal,
        subtotalLabel: 'Subtotal dos móveis',
      });

      y = drawPaymentForms(doc, y, data.subtotal, data.formas_pagamento || []);
      drawObservations(doc, y, data.observacoes);
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

module.exports = { gerarPdfOrcamentoPlanejado };
