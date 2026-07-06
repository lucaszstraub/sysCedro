const CAMPOS_ORCAMENTO = ['nome', 'telefone', 'endereco'];
const CAMPOS_VENDA_NF = ['nome', 'cpf_cnpj', 'telefone', 'email', 'endereco', 'cidade', 'estado', 'cep'];

const LABELS = {
  nome: 'Nome',
  telefone: 'Telefone',
  endereco: 'Endereço',
  cpf_cnpj: 'CPF / CNPJ',
  email: 'E-mail',
  cidade: 'Cidade',
  estado: 'Estado',
  cep: 'CEP',
};

function valorPreenchido(valor) {
  return Boolean(String(valor ?? '').trim());
}

function camposFaltantes(cliente, campos) {
  return campos.filter((campo) => !valorPreenchido(cliente?.[campo]));
}

function validarClienteCadastro(data) {
  if (!valorPreenchido(data?.nome)) {
    throw new Error('Informe o nome do cliente.');
  }
  if (!valorPreenchido(data?.telefone)) {
    throw new Error('Informe o telefone do cliente.');
  }
}

function validarClienteParaVenda(cliente) {
  const faltando = camposFaltantes(cliente, CAMPOS_VENDA_NF);
  if (faltando.length === 0) return;

  const labels = faltando.map((campo) => LABELS[campo] || campo);
  throw new Error(
    `Para confirmar a venda, complete o cadastro do cliente (dados para nota fiscal): ${labels.join(', ')}.`
  );
}

async function assertClienteParaVenda(client, clienteId) {
  const result = await client.query('SELECT * FROM clientes WHERE id = $1', [clienteId]);
  if (result.rowCount === 0) throw new Error('Cliente não encontrado.');
  validarClienteParaVenda(result.rows[0]);
}

module.exports = {
  CAMPOS_ORCAMENTO,
  CAMPOS_VENDA_NF,
  LABELS,
  camposFaltantes,
  validarClienteCadastro,
  validarClienteParaVenda,
  assertClienteParaVenda,
};
