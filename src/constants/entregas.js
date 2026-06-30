export const ENTREGA_FILTRO_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'disponivel', label: 'Disponível para entrega' },
  { value: 'parcial', label: 'Entrega parcial' },
  { value: 'indisponivel', label: 'Ainda indisponível' },
  { value: 'entregue', label: 'Entregue' },
];

export const TIPO_LIBERACAO_OPTIONS = [
  { value: 'parcial', label: 'Parcial — liberar conforme produtos ficam disponíveis' },
  { value: 'completa', label: 'Completa — aguardar todos os produtos' },
];

export const SITUACAO_ENTREGA_LABEL = {
  disponivel: 'Disponível',
  parcial: 'Parcial',
  indisponivel: 'Indisponível',
  entregue: 'Entregue',
};

export function badgeClassSituacaoEntrega(situacao) {
  if (situacao === 'disponivel') return 'badge-recebido';
  if (situacao === 'parcial') return 'badge-a-receber';
  if (situacao === 'entregue') return 'badge-recebido';
  return 'badge-estornado';
}

export const ENTREGA_KANBAN_COLUNAS = [
  { id: 'agendada', title: 'Agendadas', hint: 'Entregas e assistências com data prevista' },
  { id: 'concluida', title: 'Concluídas', hint: 'Expedições já realizadas' },
];

export function resolverColunaEntregaKanban(entrega) {
  if (entrega.status === 'agendada') return 'agendada';
  return 'concluida';
}
