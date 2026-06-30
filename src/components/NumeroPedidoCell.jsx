export default function NumeroPedidoCell({
  numeroPedido,
  clienteNome,
  vendaNumero,
  compact = false,
  showVenda = true,
  semPedidoLabel = 'Reposição',
}) {
  if (!numeroPedido && !vendaNumero) {
    return <strong className="pedido-estoque-label">{semPedidoLabel}</strong>;
  }

  return (
    <div className={`numero-pedido-cell${compact ? ' numero-pedido-cell--compact' : ''}`}>
      <div className="numero-pedido-valor">{numeroPedido || '—'}</div>
      {clienteNome && <div className="numero-pedido-cliente">{clienteNome}</div>}
      {showVenda && vendaNumero && (
        <div className="numero-pedido-ref">{vendaNumero}</div>
      )}
    </div>
  );
}
