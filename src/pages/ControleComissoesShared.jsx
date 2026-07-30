export function SaldoValor({ valor, showLabel = true }) {
  if (Math.abs(valor) < 0.01) {
    return <span className="comissao-saldo-zerado">Zerado</span>;
  }
  const isCredito = valor > 0;
  const cls = isCredito ? 'comissao-saldo-credito' : 'comissao-saldo-debito';
  const label = isCredito ? 'crédito a abater' : 'débito a pagar';
  return (
    <span className={cls}>
      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(valor))}
      {showLabel && <span className="hint-text"> ({label})</span>}
    </span>
  );
}

/** Diferença de ajuste: queda na comissão = crédito da empresa; alta = débito. */
export function AjusteDiferencaValor({ diferenca }) {
  const valor = Number(diferenca) || 0;
  if (Math.abs(valor) < 0.01) {
    return <span className="comissao-saldo-zerado">—</span>;
  }
  const isCredito = valor < 0;
  const cls = isCredito ? 'comissao-saldo-credito' : 'comissao-saldo-debito';
  const label = isCredito ? 'crédito a abater' : 'débito a pagar';
  return (
    <span className={cls}>
      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(valor))}
      <span className="hint-text"> ({label})</span>
    </span>
  );
}
