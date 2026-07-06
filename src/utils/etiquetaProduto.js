function formatDim(val) {
  const n = Number(val);
  if (!n) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export function tamanhoPadraoProduto(produto) {
  const largura = formatDim(produto.largura_cm);
  const altura = formatDim(produto.altura_cm);
  const profundidade = formatDim(produto.profundidade_cm);
  const partes = [largura, altura, profundidade].filter(Boolean);
  if (!partes.length) return '';
  return `${partes.join(' × ')} cm`;
}

export function acabamentoPadraoProduto(produto) {
  return [produto.material, produto.cor].filter(Boolean).join(' · ');
}

export const LABELS_PER_PAGE = 6;

export function flattenSelecaoEtiquetas(selecao) {
  const list = [];
  selecao.forEach((item) => {
    const qty = Math.max(Number(item.quantidade) || 1, 1);
    for (let i = 0; i < qty; i += 1) {
      list.push({
        sku: item.sku,
        nome: item.nome,
        tamanho: item.tamanho || null,
        acabamento: item.acabamento || null,
        preco_venda: Number(item.preco_venda) || 0,
      });
    }
  });
  return list;
}

export function totalEtiquetasSelecao(selecao) {
  return selecao.reduce((sum, item) => sum + Math.max(Number(item.quantidade) || 1, 1), 0);
}

export function folhasNecessarias(totalEtiquetas) {
  if (!totalEtiquetas) return 0;
  return Math.ceil(totalEtiquetas / LABELS_PER_PAGE);
}

export function mesclarNaSelecao(selecao, item) {
  const existing = selecao.find((s) => (
    s.produto_id === item.produto_id
    && s.nome === item.nome
    && s.tamanho === item.tamanho
    && s.acabamento === item.acabamento
    && Number(s.preco_venda) === Number(item.preco_venda)
  ));

  if (existing) {
    return selecao.map((s) => (
      s.key === existing.key
        ? { ...s, quantidade: s.quantidade + item.quantidade }
        : s
    ));
  }

  return [
    ...selecao,
    {
      ...item,
      key: `${item.produto_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
  ];
}

export function dadosEtiquetaFromProduto(produto) {
  return {
    produto_id: produto.id,
    sku: produto.sku || '',
    nome: produto.nome || '',
    tamanho: tamanhoPadraoProduto(produto),
    acabamento: acabamentoPadraoProduto(produto),
    preco_venda: Number(produto.preco_venda) || 0,
  };
}
