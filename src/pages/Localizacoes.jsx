import { useEffect, useState } from 'react';
import { api } from '../api';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS } from '../constants/estoque';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import LocalizacaoModal from '../components/LocalizacaoModal';

export default function Localizacoes() {
  const [localizacoes, setLocalizacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { confirm, success: showSuccess } = useFeedback();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listLocalizacoes();
      setLocalizacoes(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (editando) {
      await api.updateLocalizacao(editando.id, data);
      showSuccess(`Localização ${data.codigo} atualizada.`);
    } else {
      await api.createLocalizacao(data);
      showSuccess(`Localização ${data.codigo} cadastrada.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (loc) => {
    const ok = await confirm({
      title: 'Excluir localização',
      message: `Deseja excluir a localização ${loc.codigo} — ${loc.nome}? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(loc.id);
    setError('');
    try {
      await api.deleteLocalizacao(loc.id);
      showSuccess(`Localização ${loc.codigo} excluída.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const abrirNova = () => {
    setEditando(null);
    setShowModal(true);
  };

  const abrirEdicao = (loc) => {
    setEditando(loc);
    setShowModal(true);
  };

  return (
    <>
      <header className="page-header">
        <h2>Localizações</h2>
        <p>Corredores, prateleiras e áreas do armazém</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={abrirNova}>
          + Nova localização
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando localizações...</div>
          ) : localizacoes.length === 0 ? (
            <div className="empty-state">Nenhuma localização cadastrada. Adicione a primeira área do armazém.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Corredor</th>
                  <th>Prateleira</th>
                  <th>Capacidade</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {localizacoes.map((l) => {
                  const isSistema = l.codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS;
                  return (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.codigo}</strong>
                        {isSistema && (
                          <span className="badge badge-nao-alocados" style={{ marginLeft: '0.5rem' }}>
                            Sistema
                          </span>
                        )}
                      </td>
                      <td>{l.nome}</td>
                      <td>{l.corredor || '—'}</td>
                      <td>{l.prateleira || '—'}</td>
                      <td>{l.capacidade}</td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => abrirEdicao(l)}
                        >
                          Editar
                        </button>
                        {!isSistema && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(l)}
                            disabled={deletingId === l.id}
                          >
                            {deletingId === l.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <LocalizacaoModal
          localizacao={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
