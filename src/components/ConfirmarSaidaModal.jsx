export default function ConfirmarSaidaModal({
  onSalvar,
  onDescartar,
  onCancelar,
  saving,
  variant = 'exit',
  documentLabel = 'documento',
}) {
  const isPdf = variant === 'pdf';
  const label = documentLabel.toLowerCase();

  return (
    <div className="modal-overlay confirm-exit-overlay">
      <div className="modal confirm-exit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Alterações não salvas</h3>
        </div>
        <div className="modal-body">
          <p>
            {isPdf
              ? `Este ${label} possui alterações que ainda não foram salvas. Salve antes de gerar o PDF ou gere o documento com os dados já salvos anteriormente.`
              : `Este ${label} possui alterações que ainda não foram salvas. Deseja salvar antes de sair ou descartar as alterações?`}
          </p>
        </div>
        <div className="modal-footer picker-footer confirm-exit-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={onDescartar} disabled={saving}>
            {isPdf ? 'Gerar PDF sem salvar' : 'Descartar alterações'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onSalvar} disabled={saving}>
            {saving ? 'Salvando...' : (isPdf ? 'Salvar e gerar PDF' : 'Salvar e sair')}
          </button>
        </div>
      </div>
    </div>
  );
}
