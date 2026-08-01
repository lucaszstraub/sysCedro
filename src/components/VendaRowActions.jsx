import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useFloatingMenu } from '../hooks/useFloatingMenu';

/**
 * Ações compactas na lista de vendas: ação principal + menu "Mais".
 */
export default function VendaRowActions({
  venda,
  basePath,
  onPdf,
  onDelete,
  pdfLoading = false,
  deleteLoading = false,
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
    closeOnOutsideClick: true,
  });

  const temAReceber = Boolean(venda.tem_a_receber);
  const editTo = `${basePath}/${venda.id}/editar`;

  const toggleMenu = () => {
    markOpenedViaPointer();
    setMenuAberto((v) => !v);
  };

  const closeAnd = (fn) => () => {
    setMenuAberto(false);
    fn();
  };

  return (
    <div className="venda-row-actions">
      {temAReceber ? (
        <Link
          to={editTo}
          state={{ aba: 'pagamento' }}
          className="btn btn-primary btn-sm"
        >
          Receber
        </Link>
      ) : (
        <Link to={editTo} className="btn btn-secondary btn-sm">
          Editar
        </Link>
      )}

      <div className="venda-row-actions-menu">
        <button
          ref={triggerRef}
          type="button"
          className="btn btn-secondary btn-sm venda-row-actions-trigger"
          onClick={toggleMenu}
          aria-expanded={menuAberto}
          aria-haspopup="menu"
          aria-label={`Mais ações da venda ${venda.numero}`}
        >
          Mais
        </button>
        {menuAberto && panelStyle && createPortal(
          <div
            ref={panelRef}
            className="venda-row-actions-panel"
            style={panelStyle}
            role="menu"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {temAReceber && (
              <Link
                to={editTo}
                className="venda-row-actions-item"
                role="menuitem"
                onClick={() => setMenuAberto(false)}
              >
                Editar venda
              </Link>
            )}
            <button
              type="button"
              className="venda-row-actions-item"
              role="menuitem"
              onClick={closeAnd(() => onPdf(venda.id))}
              disabled={pdfLoading}
            >
              {pdfLoading ? 'Gerando PDF...' : 'Reimprimir PDF'}
            </button>
            <button
              type="button"
              className="venda-row-actions-item venda-row-actions-item--danger"
              role="menuitem"
              onClick={closeAnd(() => onDelete(venda.id, venda.numero))}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
