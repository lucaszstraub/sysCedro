import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import FormaPagamentoModal from '../components/FormaPagamentoModal';

export default function FormasPagamento() {
  const [formas, setFormas] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { confirm, success: showSuccess } = useFeedback();

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      setFormas(await api.listFormasPagamentoAll(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editando) {
      await api.updateFormaPagamento(editando.id, data);
      showSuccess(`Forma de pagamento ${data.nome} atualizada.`);
    } else {
      await api.createFormaPagamento(data);
      showSuccess(`Forma de pagamento ${data.nome} cadastrada.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (id, nome) => {
    const ok = await confirm({
      title: 'Desativar forma de pagamento',
      message: `Deseja desativar a forma de pagamento ${nome}?`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteFormaPagamento(id);
      showSuccess(`Forma de pagamento ${nome} desativada.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <header className="page-header">
        <h2>Formas de pagamento</h2>
        <p>Cadastre as formas de pagamento e suas taxas de desconto para uso em orçamentos e vendas</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar forma de pagamento..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">Buscar</button>
        </form>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setEditando(null); setShowModal(true); }}
        >
          + Nova forma
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          {loading ? (
            <div className="loading">Carregando formas de pagamento...</div>
          ) : formas.length === 0 ? (
            <div className="empty-state empty-state-cta">
              <p>Nenhuma forma de pagamento cadastrada.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => { setEditando(null); setShowModal(true); }}
              >
                Cadastrar primeira forma
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Taxa / desconto</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {formas.map((forma) => (
                  <tr key={forma.id}>
                    <td>{forma.nome}</td>
                    <td>{Number(forma.taxa_percentual) || 0}%</td>
                    <td>{forma.ativo ? 'Ativa' : 'Inativa'}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEditando(forma); setShowModal(true); }}
                      >
                        Editar
                      </button>
                      {forma.ativo && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(forma.id, forma.nome)}
                          disabled={deletingId === forma.id}
                        >
                          {deletingId === forma.id ? 'Desativando...' : 'Desativar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <FormaPagamentoModal
          key={editando?.id ?? 'novo'}
          forma={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
