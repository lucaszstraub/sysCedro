import { Link } from 'react-router-dom';
import { TIPO_ACOMPANHAMENTO_LABEL, calcularDataLimiteEntrega, formatarPrazoEntregaVenda } from '../constants/acompanhamentoPedidoPlanejado';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';

export default function AcompanhamentoPedidoKanbanCard({
  pedido,
  onDragStart,
  onDragOver,
  onDrop,
  onOpenObservacoes,
  onMontagemConcluida,
}) {
  const isAssistencia = pedido.tipo === 'assistencia';
  const titulo = isAssistencia ? pedido.numero : pedido.venda_numero;
  const dataLimiteEntrega = calcularDataLimiteEntrega(pedido);

  return (
    <article
      className={`kanban-card ${isAssistencia ? 'kanban-card-assistencia' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, pedido)}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="kanban-card-header">
        <strong>{titulo}</strong>
        <span className={`badge ${isAssistencia ? 'badge-assistencia' : 'badge-venda-planejada'}`}>
          {TIPO_ACOMPANHAMENTO_LABEL[pedido.tipo] || pedido.tipo}
        </span>
      </div>

      <p className="kanban-card-cliente">{pedido.cliente_nome}</p>

      {isAssistencia && pedido.descricao_assistencia && (
        <p className="kanban-card-assistencia-desc">{pedido.descricao_assistencia}</p>
      )}

      <div className="kanban-card-meta">
        {!isAssistencia && (
          <span className="kanban-card-total">{formatCurrency(pedido.total)}</span>
        )}
        {pedido.numero_pedido && (
          <span className="hint-text">Pedido {pedido.numero_pedido}</span>
        )}
        {isAssistencia && pedido.venda_numero && (
          <span className="hint-text">Ref. {pedido.venda_numero}</span>
        )}
      </div>

      {pedido.etapa === 'fabrica' && pedido.data_passagem_fabrica && (
        <p className="kanban-card-fabrica-data">
          Enviado à fábrica em {formatDateTime(pedido.data_passagem_fabrica)}
        </p>
      )}

      {dataLimiteEntrega && (
        <p className="kanban-card-entrega-limite">
          Entrega até {formatDate(dataLimiteEntrega)}
        </p>
      )}

      {!dataLimiteEntrega && pedido.prazo_entrega_outro && (
        <p className="kanban-card-entrega-limite">
          Prazo de entrega: {pedido.prazo_entrega_outro}
        </p>
      )}

      {Number(pedido.total_anotacoes) > 0 && (
        <p className="kanban-card-obs-preview" title={pedido.ultima_anotacao || ''}>
          {Number(pedido.total_anotacoes)} observação(ões)
          {pedido.ultima_anotacao ? `: ${pedido.ultima_anotacao}` : ''}
        </p>
      )}

      <div className="kanban-card-footer">
        <span className="hint-text">
          {pedido.vendedor_nome || 'Sem vendedor'}
          {!isAssistencia && (
            <>
              {' · '}
              Entrega {formatarPrazoEntregaVenda(pedido)}
            </>
          )}
          {' · '}
          {formatDate(pedido.venda_criado_em || pedido.criado_em)}
        </span>
      </div>

      <div className="kanban-card-actions">
        <Link
          to={`/ferramentas-venda/vendas-planejados/${pedido.venda_planejado_id}`}
          className="btn btn-secondary btn-sm"
          onClick={(e) => e.stopPropagation()}
        >
          Abrir venda
        </Link>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpenObservacoes(pedido);
          }}
        >
          Observações{Number(pedido.total_anotacoes) > 0 ? ` (${pedido.total_anotacoes})` : ''}
        </button>
        {pedido.etapa === 'montagem' && onMontagemConcluida && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onMontagemConcluida(pedido);
            }}
          >
            Montagem concluída
          </button>
        )}
      </div>
    </article>
  );
}
