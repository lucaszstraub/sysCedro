import { useEffect, useState } from 'react';
import { api } from '../api';
import { VENDEDOR_CLASSIFICACAO_LABEL } from '../constants/vendedor';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import VendedorModal from '../components/VendedorModal';

export default function Vendedores() {
  const [vendedores, setVendedores] = useState([]);
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
      setVendedores(await api.listVendedores(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editando) {
      await api.updateVendedor(editando.id, data);
      showSuccess(`Vendedor ${data.nome} atualizado.`);
    } else {
      await api.createVendedor(data);
      showSuccess(`Vendedor ${data.nome} cadastrado.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (id, nome) => {
    const ok = await confirm({
      title: 'Desativar vendedor',
      message: `Deseja desativar o vendedor ${nome}?`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteVendedor(id);
      showSuccess(`Vendedor ${nome} desativado.`);
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
        <h2>Vendedores</h2>
        <p>Cadastre a equipe comercial para vincular a orçamentos e vendas</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar vendedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <button type="button" className="btn btn-primary" onClick={() => { setEditando(null); setShowModal(true); }}>
          + Novo vendedor
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando vendedores...</div>
          ) : vendedores.length === 0 ? (
            <div className="empty-state">
              {busca.trim()
                ? 'Nenhum vendedor encontrado para esta busca.'
                : 'Nenhum vendedor cadastrado. Clique em "+ Novo vendedor" para começar.'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Classificação</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.nome}</strong></td>
                    <td>{VENDEDOR_CLASSIFICACAO_LABEL[v.classificacao] || v.classificacao || '—'}</td>
                    <td>{v.email || '—'}</td>
                    <td>{v.telefone || '—'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditando(v); setShowModal(true); }}>
                        Editar
                      </button>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(v.id, v.nome)}
                        disabled={deletingId === v.id}
                      >
                        {deletingId === v.id ? 'Desativando...' : 'Desativar'}
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
        <VendedorModal
          vendedor={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
