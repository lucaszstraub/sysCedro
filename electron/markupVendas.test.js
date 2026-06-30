const assert = require('assert');
const {
  calcularMarkup,
  calcularCustoUnitarioEsperado,
  recalcularCustoRealEMarkup,
  resolverCustoEstoqueCongelado,
} = require('./markupVendas');

function testEstoqueCongelado() {
  const item = {
    quantidade_estoque: 1,
    quantidade_encomenda: 0,
    custo_estoque_unitario: 1,
    preco_unitario: 2,
  };

  const custo = resolverCustoEstoqueCongelado(item, 2, true);
  assert.strictEqual(custo, 1, 'custo de estoque deve permanecer congelado');

  const esperado = calcularCustoUnitarioEsperado(1, 1, custo, 0, 0);
  const markup = calcularMarkup(2, esperado);
  assert.strictEqual(esperado, 1);
  assert.strictEqual(markup, 2);
}

function testEncomendaAtualizaNoRecebimento() {
  const item = {
    quantidade: 1,
    quantidade_estoque: 0,
    quantidade_encomenda: 1,
    quantidade_encomenda_recebida: 1,
    preco_unitario: 2,
    custo_estoque_unitario: 0,
    custo_encomenda_unitario: 1,
    custo_encomenda_real_acumulado: 2,
    custo_extra_acumulado: 1,
  };

  const { custo_unitario_real, markup_real } = recalcularCustoRealEMarkup(item);
  assert.strictEqual(custo_unitario_real, 2);
  assert.strictEqual(markup_real, 1);
}

function testMistoEstoqueCongeladoEncomendaRecebida() {
  const item = {
    quantidade: 2,
    quantidade_estoque: 1,
    quantidade_encomenda: 1,
    quantidade_encomenda_recebida: 1,
    preco_unitario: 2,
    custo_estoque_unitario: 1,
    custo_encomenda_unitario: 1,
    custo_encomenda_real_acumulado: 2,
    custo_extra_acumulado: 1,
  };

  const { custo_unitario_real, markup_real } = recalcularCustoRealEMarkup(item);
  assert.strictEqual(custo_unitario_real, 1.5);
  assert.strictEqual(markup_real, round4(2 / 1.5));
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

testEstoqueCongelado();
testEncomendaAtualizaNoRecebimento();
testMistoEstoqueCongeladoEncomendaRecebida();
console.log('markupVendas.test.js: OK');
