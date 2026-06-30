import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import FornecedorModal from '../components/FornecedorModal';

export default function Fornecedores() {
  const [fornecedores, setFornecedores] = useState([]);
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
      setFornecedores(await api.listFornecedores(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editando) {
      await api.updateFornecedor(editando.id, data);
      showSuccess(`Fornecedor ${data.nome} atualizado.`);
    } else {
      await api.createFornecedor(data);
      showSuccess(`Fornecedor ${data.nome} cadastrado.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (id, nome) => {
    const ok = await confirm({
      title: 'Desativar fornecedor',
      message: `Deseja desativar o fornecedor ${nome}?`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteFornecedor(id);
      showSuccess(`Fornecedor ${nome} desativado.`);
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
        <h2>Fornecedores</h2>
        <p>Cadastre fornecedores para vincular a produtos e encomendas</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar fornecedor, localização ou representante..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setEditando(null); setShowModal(true); }}
        >
          + Novo fornecedor
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando fornecedores...</div>
          ) : fornecedores.length === 0 ? (
            <div className="empty-state">
              {busca.trim()
                ? 'Nenhum fornecedor encontrado para esta busca.'
                : 'Nenhum fornecedor cadastrado. Clique em "+ Novo fornecedor" para começar.'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome do fornecedor</th>
                  <th>Localização</th>
                  <th>Representante</th>
                  <th>Contato do representante</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.nome}</strong></td>
                    <td>{f.localizacao || '—'}</td>
                    <td>{f.representante_nome || '—'}</td>
                    <td>{f.representante_contato || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEditando(f); setShowModal(true); }}
                      >
                        Editar
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(f.id, f.nome)}
                        disabled={deletingId === f.id}
                      >
                        {deletingId === f.id ? 'Desativando...' : 'Desativar'}
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
        <FornecedorModal
          fornecedor={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
