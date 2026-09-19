-- Limpeza operacional do SysCedro
-- Preserva: categorias, localizacoes, formas_pagamento, regras de comissão,
--           centros_custo, custos_fixos_template, usuário Master.
-- Remove: produtos, fornecedores, estoque, vendas, clientes, encomendas,
--         recebimentos, planejados, demais usuários, etc.

BEGIN;

UPDATE usuarios
SET vendedor_id = NULL
WHERE is_master = true OR LOWER(login) = 'master';

UPDATE vendedores
SET usuario_id = NULL
WHERE usuario_id IS NOT NULL;

TRUNCATE TABLE
  nota_fiscal_boletos,
  notas_fiscais,
  pagamentos_financeiros,
  custos_fixos_mensal,
  colaborador_beneficios,
  colaboradores,
  comissao_planejado_pagamentos,
  comissao_planejado_mensal,
  comissao_ajustes,
  comissao_pagamentos,
  venda_comissoes,
  venda_incentivo_parceiro_itens,
  venda_incentivos_parceiro,
  parceiros,
  arquivo_registros,
  acompanhamento_pedido_anotacoes,
  acompanhamento_pedidos_planejados,
  venda_planejado_anexos,
  venda_planejado_itens,
  venda_planejado_ambientes,
  vendas_planejados,
  produtos_planejados,
  orcamento_planejado_itens,
  orcamento_planejado_ambientes,
  orcamentos_planejados,
  entrega_itens_consignados,
  entrega_itens,
  entregas,
  ajustes_comissao,
  recebimento_encomenda_itens,
  encomenda_fornecedor_itens,
  encomendas_fornecedor,
  estoque_reservas,
  venda_alteracoes,
  venda_itens,
  venda_ambientes,
  vendas,
  orcamento_itens,
  orcamento_ambientes,
  orcamentos,
  movimentacoes,
  estoque,
  produtos,
  fornecedores,
  clientes,
  vendedores,
  sync_id_map
RESTART IDENTITY CASCADE;

DELETE FROM usuarios
WHERE NOT (COALESCE(is_master, false) = true OR LOWER(login) = 'master');

COMMIT;
