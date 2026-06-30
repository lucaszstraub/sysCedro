export const ACOMPANHAMENTO_ETAPAS = [
  {
    id: 'concretizado',
    title: 'Concretizado',
    hint: 'Vendas confirmadas aguardando envio à fábrica',
    aceitaDrop: true,
  },
  {
    id: 'fabrica',
    title: 'Em produção',
    hint: 'Pedido enviado à fábrica',
    aceitaDrop: true,
  },
  {
    id: 'deposito',
    title: 'Depósito',
    hint: 'Peças disponíveis no estoque',
    aceitaDrop: true,
  },
  {
    id: 'montagem',
    title: 'Montagem em andamento',
    hint: 'Equipe em montagem no cliente ou na loja',
    aceitaDrop: true,
  },
  {
    id: 'finalizado',
    title: 'Finalizado',
    hint: 'Pedido concluído',
    aceitaDrop: true,
    muted: true,
  },
];

export const TIPO_ACOMPANHAMENTO_LABEL = {
  venda: 'Venda',
  assistencia: 'Assistência técnica',
};

export function resolverEtapaKanban(pedido) {
  return pedido.etapa || 'concretizado';
}

export const FILTRO_ETAPA_PADRAO = 'em_andamento';

export const FILTROS_ETAPA_KANBAN = [
  {
    id: 'em_andamento',
    label: 'Em andamento (oculta finalizados)',
    etapas: ['concretizado', 'fabrica', 'deposito', 'montagem'],
  },
  {
    id: 'todos',
    label: 'Todos os estágios',
    etapas: ACOMPANHAMENTO_ETAPAS.map((e) => e.id),
  },
  ...ACOMPANHAMENTO_ETAPAS.map((e) => ({
    id: e.id,
    label: `Somente: ${e.title}`,
    etapas: [e.id],
  })),
];

export function resolverEtapasFiltro(filtroId) {
  const filtro = FILTROS_ETAPA_KANBAN.find((f) => f.id === filtroId);
  return filtro?.etapas || FILTROS_ETAPA_KANBAN[0].etapas;
}

export function formatarPrazoEntregaVenda(venda) {
  if (venda.prazo_entrega_outro) return venda.prazo_entrega_outro;
  const dias = venda.prazo_entrega_dias ?? 60;
  return `${dias} dias`;
}

export function calcularDataLimiteEntrega(pedido) {
  if (pedido.prazo_entrega_outro) return null;
  const dias = Number(pedido.prazo_entrega_dias) || 60;
  const base = pedido.venda_criado_em || pedido.criado_em;
  if (!base) return null;
  const data = new Date(base);
  if (Number.isNaN(data.getTime())) return null;
  data.setHours(12, 0, 0, 0);
  data.setDate(data.getDate() + dias);
  return data;
}
