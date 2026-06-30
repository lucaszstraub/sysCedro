import { useEffect, useState } from 'react';
import { api } from '../api';
import { ATRIBUICAO_LABEL } from '../constants/auth';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import UsuarioModal from '../components/UsuarioModal';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
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
      setUsuarios(await api.listUsuarios(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editando) {
      await api.updateUsuario(editando.id, data);
      showSuccess(`Usuário ${data.nome} atualizado.`);
    } else {
      await api.createUsuario(data);
      showSuccess(`Usuário ${data.nome} cadastrado.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (id, nome, isMaster) => {
    if (isMaster) return;

    const ok = await confirm({
      title: 'Desativar usuário',
      message: `Deseja desativar o usuário ${nome}?`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteUsuario(id);
      showSuccess(`Usuário ${nome} desativado.`);
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
        <h2>Usuários</h2>
        <p>Gerencie logins, atribuições e acessos ao sistema</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar por nome ou login..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setEditando(null); setShowModal(true); }}
        >
          + Novo usuário
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando usuários...</div>
          ) : usuarios.length === 0 ? (
            <div className="empty-state">
              {busca.trim()
                ? 'Nenhum usuário encontrado para esta busca.'
                : 'Nenhum usuário cadastrado.'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Login</th>
                  <th>Nome</th>
                  <th>Atribuição</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.login}</strong></td>
                    <td>{u.nome}</td>
                    <td>
                      {ATRIBUICAO_LABEL[u.atribuicao] || u.atribuicao}
                      {u.is_master ? ' (master)' : ''}
                    </td>
                    <td>{u.ativo ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEditando(u); setShowModal(true); }}
                      >
                        Editar
                      </button>
                      {' '}
                      {!u.is_master && u.ativo && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(u.id, u.nome, u.is_master)}
                          disabled={deletingId === u.id}
                        >
                          {deletingId === u.id ? 'Desativando...' : 'Desativar'}
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
        <UsuarioModal
          usuario={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
