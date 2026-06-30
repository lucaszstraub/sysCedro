import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { VENDAS_BASE } from '../constants/auth';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import CentroCustoModal from '../components/CentroCustoModal';

export default function CentrosCusto() {
  const [centros, setCentros] = useState([]);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(true);
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
      const lista = await api.listCentrosCusto(term, { incluirInativos: mostrarInativos });
      setCentros(lista);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [mostrarInativos]);

  const handleSearch = (e) => {
    e.preventDefault();
    load(busca);
  };

  const handleSave = async (data) => {
    if (editando) {
      await api.updateCentroCusto(editando.id, data);
      showSuccess(`Centro de custo ${data.nome} atualizado.`);
    } else {
      await api.createCentroCusto(data);
      showSuccess(`Centro de custo ${data.nome} cadastrado.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (centro) => {
    const temPagamentos = Number(centro.total_pagamentos) > 0;
    const ok = await confirm({
      title: temPagamentos ? 'Desativar centro de custo' : 'Excluir centro de custo',
      message: temPagamentos
        ? `O centro "${centro.nome}" possui ${centro.total_pagamentos} pagamento(s) vinculado(s) e será desativado (não excluído permanentemente).`
        : `Deseja excluir permanentemente o centro de custo "${centro.nome}"?`,
      confirmLabel: temPagamentos ? 'Desativar' : 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(centro.id);
    setError('');
    try {
      await api.deleteCentroCusto(centro.id);
      showSuccess(
        temPagamentos
          ? `Centro de custo ${centro.nome} desativado.`
          : `Centro de custo ${centro.nome} excluído.`
      );
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
        <h2>Centros de custo</h2>
        <p>
          Classificação de despesas para pagamentos e futura DRE.
          {' '}
          <Link to={`${VENDAS_BASE}/pagamentos`} className="hint-text">Ver lançamentos em Pagamentos</Link>
        </p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={handleSearch} className="toolbar-filters">
          <input
            className="search-input"
            placeholder="Buscar por nome ou descrição..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <label className="checkbox-label toolbar-checkbox">
            <input
              type="checkbox"
              checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)}
            />
            Mostrar inativos
          </label>
          <button type="submit" className="btn btn-secondary">Buscar</button>
        </form>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { setEditando(null); setShowModal(true); }}
        >
          + Novo centro de custo
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando centros de custo...</div>
          ) : centros.length === 0 ? (
            <div className="empty-state">
              {busca.trim()
                ? 'Nenhum centro de custo encontrado para esta busca.'
                : 'Nenhum centro de custo cadastrado.'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Descrição</th>
                  <th>Pagamentos</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {centros.map((centro) => (
                  <tr key={centro.id} className={centro.ativo === false ? 'row-inativo' : ''}>
                    <td><strong>{centro.nome}</strong></td>
                    <td className="hint-text">{centro.descricao || '—'}</td>
                    <td>{centro.total_pagamentos || 0}</td>
                    <td>
                      {centro.ativo !== false ? (
                        <span className="badge badge-recebido">Ativo</span>
                      ) : (
                        <span className="badge badge-estornado">Inativo</span>
                      )}
                    </td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEditando(centro); setShowModal(true); }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(centro)}
                        disabled={deletingId === centro.id}
                      >
                        {deletingId === centro.id
                          ? 'Processando...'
                          : Number(centro.total_pagamentos) > 0 ? 'Desativar' : 'Excluir'}
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
        <CentroCustoModal
          centro={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
