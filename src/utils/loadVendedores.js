export async function loadVendedoresPorClassificacao(api, classificacao, vendedorIdAtual = '') {
  const lista = await api.listVendedores('', classificacao);
  if (vendedorIdAtual) {
    const id = Number(vendedorIdAtual);
    if (!lista.some((v) => v.id === id)) {
      const atual = await api.getVendedor(id);
      if (atual) lista.push(atual);
    }
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
