-- Limpeza operacional do SysCedro
-- Preserva: categorias, localizacoes, formas_pagamento, regras de comissão,
--           centros_custo, custos_fixos_template, usuário Master.
-- Remove: produtos, fornecedores, estoque, vendas, clientes, encomendas,
--         recebimentos, planejados, demais usuários, etc.
--
-- IMPORTANTE: não usar TRUNCATE em vendedores com CASCADE — a FK
-- usuarios.vendedor_id faria o CASCADE apagar também o Master.

BEGIN;

-- Desvincula usuários de vendedores antes de limpar
UPDATE usuarios SET vendedor_id = NULL;
UPDATE vendedores SET usuario_id = NULL WHERE usuario_id IS NOT NULL;

-- Remove demais usuários, mantendo Master
DELETE FROM usuarios
WHERE NOT (COALESCE(is_master, false) = true OR LOWER(login) = 'master');

-- Vendedores: DELETE (não TRUNCATE CASCADE) para não afetar usuarios
DELETE FROM vendedores;

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
  sync_id_map
RESTART IDENTITY CASCADE;

-- Garante Master (senha padrão 12345 se precisar recriar via app)
UPDATE usuarios
SET vendedor_id = NULL, ativo = true, is_master = true
WHERE LOWER(login) = 'master';

COMMIT;
