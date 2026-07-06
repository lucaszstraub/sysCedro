export const CAMPOS_ORCAMENTO = ['nome', 'telefone', 'endereco'];
export const CAMPOS_VENDA_NF = ['nome', 'cpf_cnpj', 'telefone', 'email', 'endereco', 'cidade', 'estado', 'cep'];

export const CAMPOS_CLIENTE_LABELS = {
  nome: 'Nome',
  telefone: 'Telefone',
  endereco: 'Endereço',
  cpf_cnpj: 'CPF / CNPJ',
  email: 'E-mail',
  cidade: 'Cidade',
  estado: 'Estado',
  cep: 'CEP',
};

export function valorPreenchido(valor) {
  return Boolean(String(valor ?? '').trim());
}

export function camposFaltantes(cliente, campos) {
  return campos.filter((campo) => !valorPreenchido(cliente?.[campo]));
}

export function labelsCamposFaltantes(cliente, campos) {
  return camposFaltantes(cliente, campos).map((campo) => CAMPOS_CLIENTE_LABELS[campo] || campo);
}

export function clienteProntoParaOrcamento(cliente) {
  return camposFaltantes(cliente, CAMPOS_ORCAMENTO).length === 0;
}

export function clienteProntoParaVenda(cliente) {
  return camposFaltantes(cliente, CAMPOS_VENDA_NF).length === 0;
}

export function validarClienteCadastro(data) {
  if (!valorPreenchido(data?.nome)) {
    throw new Error('Informe o nome do cliente.');
  }
  if (!valorPreenchido(data?.telefone)) {
    throw new Error('Informe o telefone do cliente.');
  }
}

export function mensagemClienteIncompletoVenda(cliente) {
  const faltando = labelsCamposFaltantes(cliente, CAMPOS_VENDA_NF);
  if (faltando.length === 0) return '';
  return `Complete o cadastro do cliente antes de confirmar a venda. Dados pendentes para emissão de nota fiscal: ${faltando.join(', ')}.`;
}
