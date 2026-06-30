export const VENDEDOR_CLASSIFICACAO_MOVEIS_SOLTOS = 'moveis_soltos';
export const VENDEDOR_CLASSIFICACAO_PLANEJADOS = 'planejados';

export const VENDEDOR_CLASSIFICACAO_OPTIONS = [
  { value: VENDEDOR_CLASSIFICACAO_MOVEIS_SOLTOS, label: 'Móveis soltos' },
  { value: VENDEDOR_CLASSIFICACAO_PLANEJADOS, label: 'Planejados' },
];

export const VENDEDOR_CLASSIFICACAO_LABEL = Object.fromEntries(
  VENDEDOR_CLASSIFICACAO_OPTIONS.map((o) => [o.value, o.label])
);
