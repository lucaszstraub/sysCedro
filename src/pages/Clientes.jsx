import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import ClienteModal from '../components/ClienteModal';

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const { success: showSuccess } = useFeedback();

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      setClientes(await api.listClientes(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editando) {
      await api.updateCliente(editando.id, data);
      showSuccess(`Cliente ${data.nome} atualizado.`);
    } else {
      await api.createCliente(data);
      showSuccess(`Cliente ${data.nome} cadastrado.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const abrirNovo = () => {
    setEditando(null);
    setShowModal(true);
  };

  const abrirEdicao = (cliente) => {
    setEditando(cliente);
    setShowModal(true);
  };

  return (
    <>
      <header className="page-header">
        <h2>Clientes</h2>
        <p>Cadastre e edite clientes para orçamentos, vendas e entregas</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar por nome, CPF/CNPJ, telefone, e-mail ou cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <button type="button" className="btn btn-primary" onClick={abrirNovo}>
          + Novo cliente
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando clientes...</div>
          ) : clientes.length === 0 ? (
            <div className="empty-state">
              {busca.trim()
                ? 'Nenhum cliente encontrado para esta busca.'
                : 'Nenhum cliente cadastrado. Clique em "+ Novo cliente" para começar.'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF / CNPJ</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Cidade</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.nome}</strong></td>
                    <td>{c.cpf_cnpj || '—'}</td>
                    <td>{c.telefone || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.cidade ? `${c.cidade}${c.estado ? ` / ${c.estado}` : ''}` : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => abrirEdicao(c)}
                      >
                        Editar
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
        <ClienteModal
          cliente={editando}
          context="cadastro"
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
