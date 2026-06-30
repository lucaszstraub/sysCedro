import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import ParceiroModal from '../components/ParceiroModal';

export default function Parceiros() {
  const [parceiros, setParceiros] = useState([]);
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
      setParceiros(await api.listParceiros(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editando) {
      await api.updateParceiro(editando.id, data);
      showSuccess(`Parceiro ${data.nome_completo} atualizado.`);
    } else {
      await api.createParceiro(data);
      showSuccess(`Parceiro ${data.nome_completo} cadastrado.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (id, nome) => {
    const ok = await confirm({
      title: 'Desativar parceiro',
      message: `Deseja desativar o parceiro ${nome}?`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteParceiro(id);
      showSuccess(`Parceiro ${nome} desativado.`);
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
        <h2>Cadastro de Parceiros</h2>
        <p>Designers e arquitetos parceiros — dados de contato e pagamento</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar por nome, escritório, telefone ou Instagram..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setEditando(null); setShowModal(true); }}
        >
          + Novo parceiro
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando parceiros...</div>
          ) : parceiros.length === 0 ? (
            <div className="empty-state empty-state-cta">
              <p>
                {busca.trim()
                  ? 'Nenhum parceiro encontrado para esta busca.'
                  : 'Nenhum parceiro cadastrado ainda.'}
              </p>
              {!busca.trim() && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { setEditando(null); setShowModal(true); }}
                >
                  Cadastrar primeiro parceiro
                </button>
              )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome completo</th>
                  <th>Escritório</th>
                  <th>Telefone</th>
                  <th>Instagram</th>
                  <th>Chave PIX</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {parceiros.map((parceiro) => (
                  <tr key={parceiro.id}>
                    <td><strong>{parceiro.nome_completo}</strong></td>
                    <td>{parceiro.nome_escritorio || '—'}</td>
                    <td>{parceiro.telefone || '—'}</td>
                    <td>{parceiro.instagram || '—'}</td>
                    <td>{parceiro.chave_pix || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEditando(parceiro); setShowModal(true); }}
                      >
                        Editar
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(parceiro.id, parceiro.nome_completo)}
                        disabled={deletingId === parceiro.id}
                      >
                        {deletingId === parceiro.id ? 'Desativando...' : 'Desativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <ParceiroModal
          parceiro={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
