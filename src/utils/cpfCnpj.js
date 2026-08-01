/** Digits only from CPF/CNPJ input. */
export function apenasDigitosCpfCnpj(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

function todosDigitosIguais(digitos) {
  return /^(\d)\1+$/.test(digitos);
}

function calcularDigito(base, pesos) {
  const soma = base.split('').reduce((acc, digito, i) => acc + Number(digito) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function isCpfValido(valor) {
  const digitos = apenasDigitosCpfCnpj(valor);
  if (digitos.length !== 11 || todosDigitosIguais(digitos)) return false;
  const d1 = calcularDigito(digitos.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcularDigito(digitos.slice(0, 9) + String(d1), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digitos === digitos.slice(0, 9) + String(d1) + String(d2);
}

export function isCnpjValido(valor) {
  const digitos = apenasDigitosCpfCnpj(valor);
  if (digitos.length !== 14 || todosDigitosIguais(digitos)) return false;
  const d1 = calcularDigito(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcularDigito(digitos.slice(0, 12) + String(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digitos === digitos.slice(0, 12) + String(d1) + String(d2);
}

/** Formats as 000.000.000-00 or 00.000.000/0000-00 while typing. */
export function formatarCpfCnpj(valor) {
  const digitos = apenasDigitosCpfCnpj(valor).slice(0, 14);
  if (digitos.length <= 11) {
    return digitos
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digitos
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/**
 * Validates CPF/CNPJ when filled. Empty is allowed (optional on basic cadastro).
 * @throws {Error} when invalid
 */
export function validarCpfCnpjOpcional(valor) {
  const digitos = apenasDigitosCpfCnpj(valor);
  if (!digitos) return;
  if (digitos.length === 11) {
    if (!isCpfValido(digitos)) throw new Error('CPF inválido. Verifique os dígitos informados.');
    return;
  }
  if (digitos.length === 14) {
    if (!isCnpjValido(digitos)) throw new Error('CNPJ inválido. Verifique os dígitos informados.');
    return;
  }
  throw new Error('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
}
