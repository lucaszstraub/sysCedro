const fs = require('fs');
const { getVendaPlanejado } = require('./vendasPlanejados');
const { getAnexoPath } = require('./anexosVendaPlanejado');
const { mergePdfBuffers, anexosParaBuffers } = require('./pdfAnexosMerge');
const {
  formatDate,
  setPdfHeaderVariant,
  setPdfHeaderMeta,
  drawPdfHeader,
  drawSectionTitle,
  drawMetaPanel,
  drawClientBlock,
  drawSpecItemCard,
  drawTotalsBlock,
  drawPagamentosValor,
  drawObservations,
  drawTextBlock,
  ensureSpace,
  renderPdfToBuffer,
} = require('./pdfBrand');

const PRINT_HEADER = {
  variant: 'print',
  subtitle: 'Pedido — Móveis planejados',
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

function formatarPrazoEntrega(venda) {
  if (venda.prazo_entrega_outro) return venda.prazo_entrega_outro;
  const dias = venda.prazo_entrega_dias ?? 60;
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

function drawConferenciaBlock(doc, y, data) {
  y = ensureSpace(doc, y, 50);
  y = drawSectionTitle(doc, 'Conferência de medidas', y);
  const linha1 = `Medidas conferidas no local: ${data.medidas_conferidas ? 'Sim' : 'Não'}`;
  doc.font('Helvetica').fontSize(9.5).fillColor('#2b1a14');
  y = drawTextBlock(doc, y, linha1) + 4;
  if (data.medidas_conferidas && data.responsavel_medidas) {
    y = drawTextBlock(doc, y, `Responsável pelas medidas: ${data.responsavel_medidas}`) + 4;
  }
  return y;
}

function drawAnexosIncorporadosBlock(doc, y, anexos = []) {
  if (!anexos.length) return y;
  y = ensureSpace(doc, y, 36);
  y = drawSectionTitle(doc, 'Anexos', y);
  const nomes = anexos.map((a) => a.nome_original).filter(Boolean).join(', ');
  y = drawTextBlock(
    doc,
    y,
    `Os arquivos anexados (${nomes}) foram incorporados nas páginas seguintes deste PDF.`
  ) + 4;
  return y;
}

function renderConteudoPedido(doc, data) {
  setPdfHeaderVariant(doc, 'print');
  const headerMeta = { ...PRINT_HEADER, docTitle: `${data.numero} · Ped. ${data.numero_pedido}` };
  setPdfHeaderMeta(doc, headerMeta);

  let y = drawPdfHeader(doc, headerMeta);

  const metaItems = [
    { label: 'Emitido em', value: formatDate(data.criado_em) },
    { label: 'Prazo de entrega', value: formatarPrazoEntrega(data) },
    { label: 'Pedido nº', value: data.numero_pedido },
  ];
  if (data.vendedor_nome) {
    metaItems.push({ label: 'Vendedor projetista', value: data.vendedor_nome });
  }
  if (data.orcamento_planejado_numero) {
    metaItems.push({ label: 'Orçamento origem', value: data.orcamento_planejado_numero });
  }
  y = drawMetaPanel(doc, y, metaItems);
  y += 2;

  y = drawClientBlock(doc, y, data);
  y = drawConferenciaBlock(doc, y, data);

  for (const ambiente of data.ambientes || []) {
    y = drawSectionTitle(doc, ambiente.nome, y);
    for (const item of ambiente.itens || []) {
      y = drawItemCard(doc, y, item);
    }
    y += 4;
  }

  y = drawTotalsBlock(doc, y, {
    subtotal: data.subtotal,
    desconto: Number(data.desconto_extra) || 0,
    total: data.total_pago || data.total,
    subtotalLabel: 'Subtotal dos móveis',
  });

  y = drawPagamentosValor(doc, y, data.pagamentos || []);
  y = drawAnexosIncorporadosBlock(doc, y, data.anexos || []);
  drawObservations(doc, y, data.observacoes);
}

async function gerarPdfVendaPlanejado(filePath, vendaId) {
  const data = await getVendaPlanejado(vendaId);
  if (!data) throw new Error('Venda planejada não encontrada.');

  const mainBuffer = await renderPdfToBuffer((doc) => renderConteudoPedido(doc, data));
  const anexoBuffers = await anexosParaBuffers(data.anexos || [], getAnexoPath);

  const finalBuffer = anexoBuffers.length > 0
    ? await mergePdfBuffers([mainBuffer, ...anexoBuffers])
    : mainBuffer;

  fs.writeFileSync(filePath, finalBuffer);
  return filePath;
}

module.exports = { gerarPdfVendaPlanejado };
