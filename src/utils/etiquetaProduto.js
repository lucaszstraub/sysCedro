function formatDim(val) {
  const n = Number(val);
  if (!n) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export const DESCONTO_PADRAO_ETIQUETA = 8;
export const DIMENSAO_EXPOSTA_ETIQUETA = 'Peça Exposta';

/** Etiqueta térmica — adesivo sobre a etiqueta física do móvel (50 × 40 mm). */
export const THERMAL_LABEL_WIDTH_MM = 50;
export const THERMAL_LABEL_HEIGHT_MM = 40;

export function tamanhoLxPxA(produto) {
  const largura = formatDim(produto.largura_cm);
  const profundidade = formatDim(produto.profundidade_cm);
  const altura = formatDim(produto.altura_cm);
  const partes = [largura, profundidade, altura].filter(Boolean);
  if (!partes.length) return '';
  return `${partes.join(' × ')} cm`;
}

export function acabamentoPadraoProduto(produto) {
  return [produto.material, produto.cor].filter(Boolean).join(' · ');
}

export function dimensaoEtiquetaProduto(produto) {
  return tamanhoLxPxA(produto) || DIMENSAO_EXPOSTA_ETIQUETA;
}

/** @deprecated use dimensaoEtiquetaProduto */
export function tamanhoPadraoProduto(produto) {
  return dimensaoEtiquetaProduto(produto);
}

export function calcularPrecosEtiqueta(valorPrazo, descontoPct = DESCONTO_PADRAO_ETIQUETA) {
  const prazo = Math.max(Number(valorPrazo) || 0, 0);
  const desconto = Math.min(
    Math.max(Number(descontoPct) ?? DESCONTO_PADRAO_ETIQUETA, 0),
    100
  );
  const valorVista = round2(prazo * (1 - desconto / 100));
  const parcela = round2(prazo / 10);
  return {
    valor_prazo: prazo,
    desconto_pct: desconto,
    valor_vista: valorVista,
    parcela_1mais9: parcela,
  };
}

export function normalizarEtiqueta(data) {
  const precos = calcularPrecosEtiqueta(
    data?.valor_prazo ?? data?.preco_venda,
    data?.desconto_pct
  );
  return {
    sku: data?.sku || '',
    nome: data?.nome || '',
    tamanho: data?.tamanho?.trim() || DIMENSAO_EXPOSTA_ETIQUETA,
    acabamento: data?.acabamento || '',
    ...precos,
  };
}

export function dadosEtiquetaFromProduto(produto) {
  const valorPrazo = Number(produto.preco_venda) || 0;
  return {
    produto_id: produto.id,
    sku: produto.sku || '',
    nome: produto.nome || '',
    tamanho: dimensaoEtiquetaProduto(produto),
    acabamento: acabamentoPadraoProduto(produto),
    valor_prazo: valorPrazo,
    desconto_pct: DESCONTO_PADRAO_ETIQUETA,
    ...calcularPrecosEtiqueta(valorPrazo, DESCONTO_PADRAO_ETIQUETA),
  };
}

export function flattenSelecaoEtiquetas(selecao) {
  const list = [];
  selecao.forEach((item) => {
    const qty = Math.max(Number(item.quantidade) || 1, 1);
    const etiqueta = normalizarEtiqueta(item);
    for (let i = 0; i < qty; i += 1) {
      list.push({ ...etiqueta });
    }
  });
  return list;
}

export function totalEtiquetasSelecao(selecao) {
  return selecao.reduce((sum, item) => sum + Math.max(Number(item.quantidade) || 1, 1), 0);
}

export function mesclarNaSelecao(selecao, item) {
  const incoming = normalizarEtiqueta(item);
  const existing = selecao.find((s) => {
    const current = normalizarEtiqueta(s);
    return (
      s.produto_id === item.produto_id
      && current.nome === incoming.nome
      && current.tamanho === incoming.tamanho
      && current.acabamento === incoming.acabamento
      && current.valor_prazo === incoming.valor_prazo
      && current.desconto_pct === incoming.desconto_pct
    );
  });

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
      ...incoming,
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      key: `${item.produto_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
  ];
}

export function partesPrazoEtiqueta(valorPrazo, parcela) {
  return {
    label: 'À prazo',
    valor: formatCurrencyEtiqueta(valorPrazo),
    descritivo: `1+9x de ${formatCurrencyEtiqueta(parcela)}`,
  };
}

export function partesParcelamentoEtiqueta(parcela) {
  return partesPrazoEtiqueta(Number(parcela) * 10, parcela);
}

export function textoParcelamentoEtiqueta(valorPrazo, parcela) {
  const { descritivo } = partesPrazoEtiqueta(valorPrazo, parcela);
  return descritivo;
}

export function formatCurrencyEtiqueta(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function descricaoTamanhoEtiquetaTermica() {
  return `${THERMAL_LABEL_WIDTH_MM} × ${THERMAL_LABEL_HEIGHT_MM} mm`;
}
