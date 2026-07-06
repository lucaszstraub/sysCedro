import { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate } from '../utils/format';
import {
  CONFIRMACAO_CLIENTE_LABEL,
  labelPeriodoEntrega,
} from '../constants/entregas';
import { abrirWhatsAppAgendamento } from '../utils/entregaAgendamento';
import { useFloatingMenu } from '../hooks/useFloatingMenu';

export default function EntregaAgendadaKanbanCard({
  entrega,
  onEditar,
  onConcluir,
  onImprimir,
  onObservacoes,
  onConfirmarCliente,
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const {
    triggerRef,
    panelRef,
    panelStyle,
    markOpenedViaPointer,
  } = useFloatingMenu({
    open: menuAberto,
    onClose: () => setMenuAberto(false),
    closeOnOutsideClick: false,
  });

  const isAssistencia = entrega.tipo === 'assistencia' || entrega.flag_assistencia_tecnica;
  const concluida = entrega.status !== 'agendada';
  const aguardandoConfirmacao = entrega.confirmacao_cliente === 'pendente';

  const handleWhatsApp = async () => {
    setMenuAberto(false);
    try {
      await abrirWhatsAppAgendamento(
        entrega.cliente_telefone,
        entrega.cliente_nome,
        entrega.data_prevista,
        entrega.periodo_entrega || 'matutino'
      );
    } catch (err) {
      window.alert(err.message);
    }
  };

  const toggleMenu = () => {
    markOpenedViaPointer();
    setMenuAberto((v) => !v);
  };

  return (
    <article
      className={`kanban-card entrega-kanban-card entrega-kanban-card--static${isAssistencia ? ' kanban-card-assistencia' : ''}${entrega.flag_urgencia ? ' entrega-kanban-card--urgente' : ''}`}
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
        {!concluida && aguardandoConfirmacao && (
          <span className="badge badge-confirmacao-pendente">
            {CONFIRMACAO_CLIENTE_LABEL.pendente}
          </span>
        )}
        {!concluida && !aguardandoConfirmacao && (
          <span className="badge badge-confirmacao-ok">
            {CONFIRMACAO_CLIENTE_LABEL.confirmada}
          </span>
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
            {formatDate(entrega.data_prevista)}
            {' · '}
            {labelPeriodoEntrega(entrega.periodo_entrega || 'matutino')}
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

      <div className="kanban-card-actions entrega-kanban-actions">
        {!concluida && (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onConcluir(entrega)}>
              Registrar entrega
            </button>
            {aguardandoConfirmacao && onConfirmarCliente && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onConfirmarCliente(entrega)}
              >
                Cliente confirmou
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEditar(entrega)}>
              {aguardandoConfirmacao ? 'Alterar data' : 'Editar'}
            </button>
          </>
        )}
        <div className="entrega-kanban-menu">
          <button
            ref={triggerRef}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={toggleMenu}
            aria-expanded={menuAberto}
            aria-haspopup="menu"
          >
            Mais ações
          </button>
          {menuAberto && panelStyle && createPortal(
            <div
              ref={panelRef}
              className="entrega-kanban-menu-panel entrega-kanban-menu-panel--floating"
              style={panelStyle}
              role="menu"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {!concluida && entrega.cliente_telefone && (
                <button type="button" className="btn btn-link btn-sm" role="menuitem" onClick={handleWhatsApp}>
                  WhatsApp
                </button>
              )}
              <button
                type="button"
                className="btn btn-link btn-sm"
                role="menuitem"
                onClick={() => { setMenuAberto(false); onImprimir(entrega); }}
              >
                Ticket PDF
              </button>
              <button
                type="button"
                className="btn btn-link btn-sm"
                role="menuitem"
                onClick={() => { setMenuAberto(false); onObservacoes(entrega); }}
              >
                Observações
              </button>
            </div>,
            document.body
          )}
        </div>
      </div>
    </article>
  );
}
