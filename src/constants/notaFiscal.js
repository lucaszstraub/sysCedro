export const TOLERANCIA_BOLETOS = 0.05;

export function normalizarNumeroNotaFiscal(valor) {
  const numero = String(valor || '').trim();
  if (!/^\d+$/.test(numero)) {
    throw new Error('Informe o número da nota fiscal (apenas dígitos).');
  }
  return numero;
}

export function dividirValorEntreBoletos(valorTotal, quantidade) {
  const qtd = Math.max(1, Number(quantidade) || 1);
  const totalCents = Math.round((Number(valorTotal) || 0) * 100);
  const base = Math.floor(totalCents / qtd);
  const resto = totalCents - base * qtd;

  return Array.from({ length: qtd }, (_, index) => {
    const cents = base + (index < resto ? 1 : 0);
    return {
      parcela: index + 1,
      valor: cents / 100,
      data_vencimento: '',
    };
  });
}

export function validarSomaBoletos(valorTotal, boletos = []) {
  if (!boletos.length) return null;

  const total = Math.round((Number(valorTotal) || 0) * 100) / 100;
  const soma = Math.round(boletos.reduce((acc, b) => acc + (Number(b.valor) || 0), 0) * 100) / 100;

  if (soma > total) {
    return 'A soma dos boletos não pode superar o valor total da nota fiscal.';
  }
  if (soma < Math.round((total - TOLERANCIA_BOLETOS) * 100) / 100) {
    return `A soma dos boletos deve ser igual ao valor da nota (tolerância de R$ ${TOLERANCIA_BOLETOS.toFixed(2).replace('.', ',')}).`;
  }

  for (let index = 0; index < boletos.length; index += 1) {
    const boleto = boletos[index];
    if ((Number(boleto.valor) || 0) <= 0) {
      return `Informe o valor do boleto ${index + 1}.`;
    }
    if (!boleto.data_vencimento) {
      return `Informe o vencimento do boleto ${index + 1}.`;
    }
  }

  return null;
}

export function calcularSomaBoletos(boletos = []) {
  return Math.round(boletos.reduce((acc, b) => acc + (Number(b.valor) || 0), 0) * 100) / 100;
}
