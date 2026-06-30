import { formatCurrency, formatDate } from '../utils/format';

function CabecalhoVenda({ cabecalho }) {
  return (
    <div className="arquivo-preview-cabecalho">
      <div><span className="label">Cliente</span><strong>{cabecalho.cliente_nome || '—'}</strong></div>
      <div><span className="label">Vendedor</span><strong>{cabecalho.vendedor_nome || '—'}</strong></div>
      <div><span className="label">Total pago</span><strong>{formatCurrency(cabecalho.total_pago)}</strong></div>
      <div><span className="label">Status</span><strong>{cabecalho.status || '—'}</strong></div>
    </div>
  );
}

function CabecalhoEncomenda({ cabecalho }) {
  return (
    <div className="arquivo-preview-cabecalho">
      <div><span className="label">Fornecedor</span><strong>{cabecalho.fornecedor_nome || '—'}</strong></div>
      <div><span className="label">Status</span><strong>{cabecalho.status || '—'}</strong></div>
      <div><span className="label">Data pedido</span><strong>{formatDate(cabecalho.data_pedido)}</strong></div>
      <div><span className="label">Previsão</span><strong>{formatDate(cabecalho.previsao_entrega)}</strong></div>
    </div>
  );
}

export default function ArquivoPreview({ preview }) {
  if (!preview) return null;

  if (preview.tipo === 'venda') {
    return (
      <div className="arquivo-preview">
        <h4 className="arquivo-preview-titulo">Itens arquivados</h4>
        <CabecalhoVenda cabecalho={preview.cabecalho} />

        {(preview.ambientes || []).map((ambiente) => (
          <div key={ambiente.nome} className="arquivo-preview-secao">
            <div className="arquivo-preview-secao-titulo">{ambiente.nome}</div>
            {ambiente.itens.length === 0 ? (
              <p className="hint-text">Nenhum item neste ambiente.</p>
            ) : (
              <table className="arquivo-preview-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Qtd.</th>
                    <th>Estoque</th>
                    <th>Encomenda</th>
                    <th>Preço un.</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {ambiente.itens.map((item, idx) => (
                    <tr key={`${item.descricao}-${idx}`}>
                      <td>
                        <strong>{item.descricao}</strong>
                        {item.sku && <div className="hint-text">{item.sku}</div>}
                      </td>
                      <td>{item.quantidade}</td>
                      <td>{item.quantidade_estoque}</td>
                      <td>{item.quantidade_encomenda}</td>
                      <td>{formatCurrency(item.preco_unitario)}</td>
                      <td>{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

        {preview.pagamentos?.length > 0 && (
          <div className="arquivo-preview-secao">
            <div className="arquivo-preview-secao-titulo">Pagamentos</div>
            <table className="arquivo-preview-table">
              <thead>
                <tr>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th>Parcelas</th>
                </tr>
              </thead>
              <tbody>
                {preview.pagamentos.map((pag, idx) => (
                  <tr key={`${pag.forma}-${idx}`}>
                    <td>{pag.forma}</td>
                    <td>{formatCurrency(pag.valor)}</td>
                    <td>{pag.parcelas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (preview.tipo === 'encomenda_fornecedor') {
    return (
      <div className="arquivo-preview">
        <h4 className="arquivo-preview-titulo">Itens arquivados</h4>
        <CabecalhoEncomenda cabecalho={preview.cabecalho} />

        {preview.itens?.length === 0 ? (
          <p className="hint-text">Nenhum item na encomenda.</p>
        ) : (
          <table className="arquivo-preview-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Custo neg.</th>
                <th>Custo c/ imp.</th>
                <th>Destino</th>
                <th>Vínculo</th>
              </tr>
            </thead>
            <tbody>
              {preview.itens.map((item, idx) => (
                <tr key={`${item.descricao}-${idx}`}>
                  <td>
                    <strong>{item.descricao}</strong>
                    {item.sku && <div className="hint-text">{item.sku}</div>}
                  </td>
                  <td>{item.quantidade_pedida}</td>
                  <td>{formatCurrency(item.custo_negociado)}</td>
                  <td>{formatCurrency(item.custo_com_impostos)}</td>
                  <td>{item.destino === 'cliente' ? 'Cliente' : 'Estoque'}</td>
                  <td>
                    {item.venda_numero
                      ? `${item.venda_numero}${item.cliente_nome ? ` · ${item.cliente_nome}` : ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return null;
}
