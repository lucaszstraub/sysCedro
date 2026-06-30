export function formatMarkup(valor) {
  const n = Number(valor);
  if (!n || Number.isNaN(n)) return '—';
  return `${n.toFixed(2)}x`;
}

export function formatMargemPercent(receita, custo) {
  const r = Number(receita) || 0;
  const c = Number(custo) || 0;
  if (r <= 0) return '—';
  const pct = ((r - c) / r) * 100;
  return `${pct.toFixed(1)}%`;
}
