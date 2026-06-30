import { Link } from 'react-router-dom';
import { formatMarkup } from '../constants/markup';
import { formatCurrency, formatDate } from '../utils/format';

function MarkupCell({ markup }) {
  if (markup == null) {
    return <span className="analise-muted" title="Custo real ainda não definido">Pendente</span>;
  }
  return <strong className="analise-markup-value">{formatMarkup(markup)}</strong>;
}

export default function VisaoVendasPedidoModal({ detalhe, onClose }) {
  if (!detalhe) return null;

  const { venda, pedido, itens, incentivo_parceiro: incentivo } = detalhe;

  return (
    <div className="modal-overlay analise-modal-overlay" onClick={onClose}>
      <div className="modal modal-lg analise-pedido-modal" onClick={(e) => e.stopPropagation()}>
        <div className="analise-pedido-modal-header">
          <div>
            <p className="analise-pedido-modal-eyebrow">Detalhe do pedido</p>
            <h3>
              {venda.numero_pedido || venda.numero}
              <span className="analise-pedido-modal-cliente"> · {venda.cliente_nome}</span>
            </h3>
            <p className="analise-pedido-modal-meta">
              {formatDate(venda.criado_em)}
              {venda.vendedor_nome ? ` · ${venda.vendedor_nome}` : ''}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">&times;</button>
        </div>

        <div className="modal-body analise-pedido-modal-body">
          {venda.tem_alteracao_pos_venda && venda.nota_alteracao && (
            <div className="analise-inline-alert analise-inline-alert--warning">
              <strong>Pedido alterado após confirmação</strong>
              <p>{venda.nota_alteracao}</p>
            </div>
          )}

          {venda.tem_a_receber && (
            <div className="analise-inline-alert analise-inline-alert--receber">
              <div>
                <strong>Pagamento a receber</strong>
                <p>{formatCurrency(venda.valor_a_receber)} pendente neste pedido</p>
              </div>
              <Link
                to={`/ferramentas-venda/vendas/${venda.id}/editar`}
                state={{ aba: 'pagamento' }}
                className="btn btn-primary btn-sm"
                onClick={onClose}
              >
                Registrar pagamento
              </Link>
            </div>
          )}

          <div className="analise-pedido-kpis">
            <div className="analise-pedido-kpi">
              <span>Valor do pedido</span>
              <strong>{formatCurrency(pedido?.valor_total ?? venda.total)}</strong>
            </div>
            <div className="analise-pedido-kpi">
              <span>Markup do pedido</span>
              <MarkupCell markup={pedido?.markup_pedido ?? detalhe.consolidado?.markup_real_consolidado} />
            </div>
            <div className="analise-pedido-kpi">
              <span>Custo real</span>
              <strong>{formatCurrency(pedido?.custo_real ?? detalhe.consolidado?.custo_real_total)}</strong>
            </div>
            <div className="analise-pedido-kpi">
              <span>RT (parceiro)</span>
              <strong>{formatCurrency(venda.rt || 0)}</strong>
            </div>
            <div className="analise-pedido-kpi">
              <span>Itens</span>
              <strong>{pedido?.qtd_itens ?? itens.length}</strong>
            </div>
          </div>

          {incentivo && (
            <div className="analise-parceiro-chip">
              <span>Parceiro</span>
              <strong>{incentivo.parceiro_nome}</strong>
              {incentivo.parceiro_escritorio && (
                <span className="analise-muted"> · {incentivo.parceiro_escritorio}</span>
              )}
            </div>
          )}

          <div className="analise-produtos-table-wrap">
            <table className="analise-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Receita líq.</th>
                  <th>Incentivo</th>
                  <th>Custo real</th>
                  <th>Markup</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.venda_item_id || item.id}>
                    <td>
                      <strong>{item.descricao}</strong>
                      {item.produto_sku && <div className="analise-muted">{item.produto_sku}</div>}
                    </td>
                    <td>{item.quantidade}</td>
                    <td>{formatCurrency(item.receita_liquida_real)}</td>
                    <td>{item.incentivo_deducao > 0 ? formatCurrency(item.incentivo_deducao) : '—'}</td>
                    <td>{item.tem_custo_real ? formatCurrency(item.custo_real_total) : '—'}</td>
                    <td><MarkupCell markup={item.markup_real} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="analise-pedido-modal-footer">
            <Link
              to={`/ferramentas-venda/vendas/${venda.id}/editar`}
              className="btn btn-secondary btn-sm"
              onClick={onClose}
            >
              Abrir pedido completo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
