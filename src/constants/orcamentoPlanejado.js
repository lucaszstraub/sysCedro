export const AMBIENTE_NOME_PADRAO = 'Geral';

export const STATUS_OPTIONS = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'recusado', label: 'Recusado' },
  { value: 'expirado', label: 'Expirado' },
];

export const STATUS_LABEL = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const KANBAN_COLUMNS = [
  { id: 'rascunho', title: 'Rascunho', status: 'rascunho', aceitaDrop: true },
  { id: 'enviado', title: 'Enviado', status: 'enviado', aceitaDrop: true },
  { id: 'aprovado', title: 'Aprovado', status: 'aprovado', aceitaDrop: true },
  {
    id: 'encerrado',
    title: 'Rejeitado / Expirado',
    status: 'encerrado',
    aceitaDrop: true,
    motivoDrop: 'recusado',
  },
];

export const MOTIVO_ENCERRAMENTO_LABEL = {
  recusado: 'Rejeitado pelo cliente',
  expirado: 'Expirado (validade)',
};

export function resolverColunaKanban(orcamento) {
  if (orcamento.status === 'recusado' || orcamento.status === 'expirado') return 'encerrado';
  return orcamento.status;
}

export const VALIDADE_DIAS_OPTIONS = [15, 30, 45, 60, 90];

export const PRAZO_ENTREGA_OPTIONS = [
  { value: 30, label: '30 dias' },
  { value: 45, label: '45 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
  { value: 'outro', label: 'Outro' },
];

export const PRAZO_ENTREGA_PADRAO = 60;

export const TIPO_FUNDO_OPTIONS = [
  { value: 'vazado', label: 'Vazado' },
  { value: 'grosso', label: 'Grosso' },
  { value: 'fino', label: 'Fino' },
  { value: 'com_manta_isolante', label: 'Com manta isolante' },
  { value: 'outro', label: 'Outro' },
];

export const TIPO_PORTA_OPTIONS = [
  { value: 'sem_porta', label: 'Sem porta' },
  { value: 'porta_correr', label: 'Porta de correr' },
  { value: 'porta_giro', label: 'Porta de giro' },
  { value: 'outro', label: 'Outro' },
];

export const TIPO_PUXADOR_OPTIONS = [
  { value: 'sem_puxador', label: 'Sem puxador' },
  { value: 'usinado', label: 'Usinado' },
  { value: 'versatille', label: 'Versatille' },
  { value: 'px_60', label: 'Px-60' },
  { value: 'roma_8015', label: 'Roma (8015)' },
  { value: 'sier_recorte_45', label: 'Sier (Recorte 45)' },
  { value: 'outro', label: 'Outro' },
];

export const TIPO_CORREDICAS_OPTIONS = [
  { value: 'sem_corredicas', label: 'Sem corrediças' },
  { value: 'padrao', label: 'Padrão' },
  { value: 'invisiveis', label: 'Invisíveis' },
  { value: 'outro', label: 'Outro' },
];

export const OPCAO_OUTRO = { value: 'outro', label: 'Outro' };

export function optionsComOutro(options) {
  if (options.some((o) => o.value === OPCAO_OUTRO.value)) return options;
  return [...options, OPCAO_OUTRO];
}

export function labelCampoPlanejadoComOutro(tipo, outroTexto, labels) {
  if (tipo === OPCAO_OUTRO.value && outroTexto) return outroTexto;
  return labels[tipo] || tipo || '—';
}

export const TIPO_FUNDO_LABEL = Object.fromEntries(TIPO_FUNDO_OPTIONS.map((o) => [o.value, o.label]));
export const TIPO_PORTA_LABEL = Object.fromEntries(TIPO_PORTA_OPTIONS.map((o) => [o.value, o.label]));
export const TIPO_PUXADOR_LABEL = Object.fromEntries(TIPO_PUXADOR_OPTIONS.map((o) => [o.value, o.label]));
export const TIPO_CORREDICAS_LABEL = Object.fromEntries(TIPO_CORREDICAS_OPTIONS.map((o) => [o.value, o.label]));

export const FORMAS_PAGAMENTO_PADRAO = [
  { id: 'avista', nome: 'À vista', desconto_percentual: 10 },
  { id: 'cartao_1_6', nome: 'Cartão 1+6x', desconto_percentual: 5 },
  { id: 'cartao_6_10', nome: 'Cartão 6x a 10x', desconto_percentual: 0 },
];

export function calcularTotalComDesconto(subtotal, descontoPercentual) {
  const valor = Number(subtotal) || 0;
  const pct = Number(descontoPercentual) || 0;
  return Math.max(valor - (valor * pct / 100), 0);
}

export function criarFormaPagamento() {
  return {
    id: `forma_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    nome: '',
    desconto_percentual: 0,
  };
}

export function criarItemPlanejado() {
  return {
    descricao: '',
    produto_planejado_id: '',
    largura: '',
    profundidade: '',
    altura: '',
    espessura_mdf: 18,
    padrao_mdf: '',
    tipo_fundo: 'fino',
    tipo_fundo_outro: '',
    tipo_porta: 'sem_porta',
    tipo_porta_outro: '',
    tipo_puxador: 'sem_puxador',
    tipo_puxador_outro: '',
    cor_puxador: '',
    tipo_corredicas: 'sem_corredicas',
    tipo_corredicas_outro: '',
    canaleta_led: false,
    itens_extra: '',
    quantidade: 1,
    preco_unitario: 0,
  };
}

export function aplicarTemplatePlanejado(item, template) {
  if (!template) {
    return { ...item, produto_planejado_id: '' };
  }
  const precoSugerido = Number(template.preco_unitario_sugerido) || 0;
  return {
    ...item,
    produto_planejado_id: template.id,
    largura: template.largura ?? '',
    profundidade: template.profundidade ?? '',
    altura: template.altura ?? '',
    espessura_mdf: template.espessura_mdf ?? 18,
    padrao_mdf: template.padrao_mdf || '',
    tipo_fundo: template.tipo_fundo || 'fino',
    tipo_fundo_outro: template.tipo_fundo_outro || '',
    tipo_porta: template.tipo_porta || 'sem_porta',
    tipo_porta_outro: template.tipo_porta_outro || '',
    tipo_puxador: template.tipo_puxador || 'sem_puxador',
    tipo_puxador_outro: template.tipo_puxador_outro || '',
    cor_puxador: template.cor_puxador || '',
    tipo_corredicas: template.tipo_corredicas || 'sem_corredicas',
    tipo_corredicas_outro: template.tipo_corredicas_outro || '',
    canaleta_led: Boolean(template.canaleta_led),
    itens_extra: template.itens_extra || '',
    preco_unitario: precoSugerido > 0 ? precoSugerido : item.preco_unitario,
  };
}

export function criarProdutoPlanejadoTemplate() {
  return {
    nome: '',
    largura: '',
    profundidade: '',
    altura: '',
    espessura_mdf: 18,
    padrao_mdf: '',
    tipo_fundo: 'fino',
    tipo_fundo_outro: '',
    tipo_porta: 'sem_porta',
    tipo_porta_outro: '',
    tipo_puxador: 'sem_puxador',
    tipo_puxador_outro: '',
    cor_puxador: '',
    tipo_corredicas: 'sem_corredicas',
    tipo_corredicas_outro: '',
    canaleta_led: false,
    itens_extra: '',
    preco_unitario_sugerido: 0,
  };
}

export function formatarPrazoEntrega(orcamento) {
  if (orcamento.prazo_entrega_outro) {
    return orcamento.prazo_entrega_outro;
  }
  const dias = orcamento.prazo_entrega_dias ?? PRAZO_ENTREGA_PADRAO;
  return `${dias} dias`;
}

export function formatDimensaoPlanejada(value) {
  if (value == null || value === '') return '—';
  return `${value} cm`;
}
