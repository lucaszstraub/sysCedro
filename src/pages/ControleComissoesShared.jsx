export function SaldoValor({ valor, showLabel = true }) {
  if (Math.abs(valor) < 0.01) {
    return <span className="comissao-saldo-zerado">Zerado</span>;
  }
  const cls = valor > 0 ? 'comissao-saldo-credito' : 'comissao-saldo-debito';
  const label = valor > 0 ? 'crédito' : 'débito';
  return (
    <span className={cls}>
      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(valor))}
      {showLabel && <span className="hint-text"> ({label})</span>}
    </span>
  );
}
