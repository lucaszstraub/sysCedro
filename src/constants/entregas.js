export const ENTREGA_FILTRO_OPTIONS = [
  { value: 'todos', label: 'Todos os pedidos' },
  { value: 'disponivel', label: 'Prontos para agendar' },
  { value: 'parcial', label: 'Entrega em andamento' },
  { value: 'indisponivel', label: 'Aguardando estoque' },
  { value: 'entregue', label: 'Totalmente entregues' },
];

export const TIPO_LIBERACAO_OPTIONS = [
  { value: 'parcial', label: 'Parcial — liberar conforme produtos ficam disponíveis' },
  { value: 'completa', label: 'Completa — aguardar todos os produtos' },
];

export const SITUACAO_ENTREGA_LABEL = {
  disponivel: 'Pronto para agendar',
  parcial: 'Em andamento',
  indisponivel: 'Aguardando estoque',
  entregue: 'Entregue',
};

export const SITUACAO_ENTREGA_HINT = {
  disponivel: 'Todos os itens liberados podem ser agendados para expedição.',
  parcial: 'Parte dos itens já foi entregue; ainda há pendências.',
  indisponivel: 'Aguardando recebimento de encomenda ou disponibilidade em estoque.',
  entregue: 'Todos os itens deste pedido foram entregues.',
};

export function badgeClassSituacaoEntrega(situacao) {
  if (situacao === 'disponivel') return 'badge-recebido';
  if (situacao === 'parcial') return 'badge-a-receber';
  if (situacao === 'entregue') return 'badge-recebido';
  return 'badge-estornado';
}

export const ENTREGA_KANBAN_COLUNAS = [
  {
    id: 'agendada',
    title: 'Na fila de expedição',
    hint: 'Expedições com data prevista — confirme com o cliente e conclua após a entrega física.',
    highlight: true,
  },
  {
    id: 'concluida',
    title: 'Já entregues',
    hint: 'Expedições concluídas. O estoque foi baixado ao registrar a entrega.',
    muted: true,
  },
];

export const ENTREGA_KANBAN_FILTROS = [
  { value: 'todos', label: 'Todas' },
  { value: 'pendente', label: 'Aguardando cliente' },
  { value: 'urgencia', label: 'Urgência' },
  { value: 'assistencia', label: 'Assistência' },
];

export function resolverColunaEntregaKanban(entrega) {
  if (entrega.status === 'agendada') return 'agendada';
  return 'concluida';
}

export const PERIODO_ENTREGA_OPTIONS = [
  { value: 'matutino', label: 'Matutino (manhã)' },
  { value: 'vespertino', label: 'Vespertino (tarde)' },
];

export const CONFIRMACAO_CLIENTE_LABEL = {
  pendente: 'Aguardando confirmação',
  confirmada: 'Confirmada pelo cliente',
};

export function labelPeriodoEntrega(periodo) {
  return PERIODO_ENTREGA_OPTIONS.find((opt) => opt.value === periodo)?.label
    || PERIODO_ENTREGA_OPTIONS[0].label;
}

export const MODE_ENTREGA_LABEL = {
  agendar: {
    titulo: 'Agendar expedição',
    submit: 'Salvar pré-agendamento',
    dataLabel: 'Data prevista',
  },
  editar: {
    titulo: 'Editar expedição',
    submit: 'Salvar alterações',
    dataLabel: 'Data prevista',
  },
  concluir: {
    titulo: 'Registrar entrega física',
    submit: 'Confirmar entrega e baixar estoque',
    dataLabel: 'Data agendada',
  },
};

export function podeAgendarEntrega(entrega) {
  return entrega.situacao === 'disponivel' || entrega.situacao === 'parcial';
}

export function formatarResumoExpedicoes(expedicoes, formatDate) {
  if (!expedicoes?.total) return 'Nenhuma expedição';
  const partes = [];
  if (expedicoes.agendadas > 0) {
    partes.push(`${expedicoes.agendadas} agendada${expedicoes.agendadas > 1 ? 's' : ''}`);
  }
  if (expedicoes.concluidas > 0) {
    partes.push(`${expedicoes.concluidas} entregue${expedicoes.concluidas > 1 ? 's' : ''}`);
  }
  if (expedicoes.proxima_data && formatDate) {
    partes.push(`próxima ${formatDate(expedicoes.proxima_data)}`);
  }
  return partes.join(' · ') || `${expedicoes.total} expedição(ões)`;
}
