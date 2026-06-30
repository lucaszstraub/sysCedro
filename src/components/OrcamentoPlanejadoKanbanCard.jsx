import { Link } from 'react-router-dom';
import { MOTIVO_ENCERRAMENTO_LABEL, formatarPrazoEntrega } from '../constants/orcamentoPlanejado';
import { formatCurrency, formatDate } from '../utils/format';

export default function OrcamentoPlanejadoKanbanCard({
  orcamento,
  onDragStart,
  onDragOver,
  onDrop,
  onIniciarVenda,
}) {
  const encerrado = orcamento.status === 'recusado' || orcamento.status === 'expirado';
  const motivo = orcamento.motivo_encerramento || orcamento.status;

  return (
    <article
      className="kanban-card"
      draggable
      onDragStart={(e) => onDragStart(e, orcamento)}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="kanban-card-header">
        <strong>{orcamento.numero}</strong>
        {encerrado && (
          <span className={`badge ${motivo === 'expirado' ? 'badge-estornado' : 'badge-a-receber'}`}>
            {MOTIVO_ENCERRAMENTO_LABEL[motivo] || motivo}
          </span>
        )}
      </div>

      <p className="kanban-card-cliente">{orcamento.cliente_nome}</p>

      <div className="kanban-card-meta">
        <span className="kanban-card-total">{formatCurrency(orcamento.total)}</span>
        {Number(orcamento.desconto) > 0.005 && (
          <span className="hint-text" title="Desconto extra sobre o subtotal dos móveis">
            Desc. extra {formatCurrency(orcamento.desconto)}
          </span>
        )}
        <span className="hint-text">{orcamento.total_itens || 0} móvel(is)</span>
      </div>

      <div className="kanban-card-footer">
        <span className="hint-text">
          {orcamento.vendedor_nome || 'Sem vendedor'}
          {' · '}
          Entrega {formatarPrazoEntrega(orcamento)}
          {' · '}
          Validade {formatDate(orcamento.validade)}
        </span>
      </div>

      <div className="kanban-card-actions">
        <Link
          to={`/ferramentas-venda/orcamentos-planejados/${orcamento.id}`}
          className="btn btn-secondary btn-sm"
          onClick={(e) => e.stopPropagation()}
        >
          Abrir
        </Link>
        {orcamento.status === 'aprovado' && (
          orcamento.venda_planejado_numero ? (
            <Link
              to={`/ferramentas-venda/vendas-planejados/${orcamento.venda_planejado_id}`}
              className="btn btn-primary btn-sm"
              onClick={(e) => e.stopPropagation()}
              title="Venda planejada vinculada a este orçamento"
            >
              {orcamento.venda_planejado_numero}
            </Link>
          ) : onIniciarVenda ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                onIniciarVenda(orcamento);
              }}
            >
              Iniciar venda
            </button>
          ) : null
        )}
      </div>
    </article>
  );
}
