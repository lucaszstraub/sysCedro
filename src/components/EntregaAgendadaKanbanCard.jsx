import { formatCurrency, formatDate } from '../utils/format';

export default function EntregaAgendadaKanbanCard({
  entrega,
  onEditar,
  onConcluir,
  onImprimir,
  onObservacoes,
}) {
  const isAssistencia = entrega.tipo === 'assistencia' || entrega.flag_assistencia_tecnica;
  const concluida = entrega.status !== 'agendada';

  return (
    <article
      className={`kanban-card entrega-kanban-card${isAssistencia ? ' kanban-card-assistencia' : ''}${entrega.flag_urgencia ? ' entrega-kanban-card--urgente' : ''}`}
    >
      <div className="kanban-card-header">
        <strong>{entrega.numero_pedido || entrega.venda_numero}</strong>
        {entrega.indice_label && (
          <span className="entrega-kanban-indice">{entrega.indice_label}</span>
        )}
      </div>

      <p className="kanban-card-cliente">{entrega.cliente_nome}</p>

      <div className="entrega-kanban-flags">
        {entrega.flag_urgencia && (
          <span className="badge badge-urgencia">Urgência</span>
        )}
        {isAssistencia && (
          <span className="badge badge-assistencia">Assistência técnica</span>
        )}
        {entrega.tem_a_receber && (
          <span className="badge badge-a-receber">Saldo a cobrar</span>
        )}
      </div>

      {isAssistencia && entrega.descricao_assistencia && (
        <p className="kanban-card-assistencia-desc">{entrega.descricao_assistencia}</p>
      )}

      <div className="kanban-card-meta entrega-kanban-meta">
        <span className="hint-text">
          {entrega.vendedor_nome || 'Sem vendedora'}
          {' · Pedido '}
          {formatDate(entrega.venda_criado_em)}
        </span>
        {entrega.data_prevista && (
          <span className="entrega-kanban-data">
            Agendada para {formatDate(entrega.data_prevista)}
          </span>
        )}
        {entrega.tem_a_receber && (
          <span className="entrega-kanban-saldo">{formatCurrency(entrega.valor_a_receber)}</span>
        )}
      </div>

      {entrega.observacoes_kanban && (
        <p className="kanban-card-obs-preview" title={entrega.observacoes_kanban}>
          {entrega.observacoes_kanban}
        </p>
      )}

      <div className="kanban-card-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onImprimir(entrega)}>
          Ticket
        </button>
        {!concluida && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditar(entrega)}>
              Editar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onConcluir(entrega)}>
              Concluir
            </button>
          </>
        )}
        <button type="button" className="btn btn-link btn-sm" onClick={() => onObservacoes(entrega)}>
          Observações
        </button>
      </div>
    </article>
  );
}
