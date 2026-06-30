export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

export function toInputDate(value) {
  if (!value) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const str = String(dateStr);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match.map(Number);
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
      new Date(year, month - 1, day)
    );
  }
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(dateStr));
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dateStr));
}

export function formatDimensions(p) {
  if (!p.largura_cm && !p.altura_cm && !p.profundidade_cm) return '-';
  return `${p.largura_cm || 0} × ${p.altura_cm || 0} × ${p.profundidade_cm || 0} cm`;
}

export const TIPO_MOVIMENTACAO = {
  entrada: 'Entrada',
  saida: 'Saída',
  transferencia: 'Transferência',
  ajuste: 'Ajuste',
};
