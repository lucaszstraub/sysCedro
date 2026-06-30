import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { FUNCAO_COLABORADOR_LABEL } from '../constants/auth';
import { formatCurrency } from '../utils/format';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import ColaboradorModal from '../components/ColaboradorModal';

export default function QuadroColaboradores() {
  const [colaboradores, setColaboradores] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroFuncao, setFiltroFuncao] = useState('');
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
      setColaboradores(await api.listColaboradores(term));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const colaboradoresFiltrados = useMemo(() => {
    if (!filtroFuncao) return colaboradores;
    return colaboradores.filter((c) => c.funcao === filtroFuncao);
  }, [colaboradores, filtroFuncao]);

  const resumo = useMemo(() => {
    const ativos = colaboradores.filter((c) => c.ativo !== false);
    return {
      total: colaboradores.length,
      ativos: ativos.length,
      folhaMensal: ativos.reduce((sum, c) => sum + (Number(c.remuneracao_total) || 0), 0),
    };
  }, [colaboradores]);

  const abrirNovo = () => {
    setEditando(null);
    setShowModal(true);
  };

  const abrirEdicao = async (id) => {
    setError('');
    try {
      const detalhe = await api.getColaborador(id);
      setEditando(detalhe);
      setShowModal(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = async (data) => {
    if (editando) {
      await api.updateColaborador(editando.id, data);
      showSuccess(`Colaborador ${data.nome} atualizado.`);
    } else {
      await api.createColaborador(data);
      showSuccess(`Colaborador ${data.nome} cadastrado.`);
    }
    setShowModal(false);
    setEditando(null);
    await load();
  };

  const handleDelete = async (id, nome) => {
    const ok = await confirm({
      title: 'Desativar colaborador',
      message: `Deseja desativar o colaborador ${nome}?`,
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteColaborador(id);
      showSuccess(`Colaborador ${nome} desativado.`);
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
        <h2>Quadro de colaboradores</h2>
        <p>
          Cadastre funções, salários, benefícios e vínculo com usuários.
          Colaboradores com função de vendedor ou vendedor projetista são sincronizados automaticamente para orçamentos, vendas e comissões.
        </p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="stats-grid visao-vendas-stats" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="label">Colaboradores</div>
          <div className="value">{resumo.total}</div>
          <div className="hint-text">{resumo.ativos} ativo(s)</div>
        </div>
        <div className="stat-card stat-card-priority">
          <div className="label">Folha mensal estimada</div>
          <div className="value">{formatCurrency(resumo.folhaMensal)}</div>
          <div className="hint-text">Salário + benefícios (ativos)</div>
        </div>
      </div>

      <div className="toolbar">
        <form
          className="toolbar-filters"
          onSubmit={(e) => { e.preventDefault(); load(busca); }}
        >
          <input
            className="search-input"
            placeholder="Buscar por nome ou usuário..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select
            value={filtroFuncao}
            onChange={(e) => setFiltroFuncao(e.target.value)}
            aria-label="Filtrar por função"
          >
            <option value="">Todas as funções</option>
            {Object.entries(FUNCAO_COLABORADOR_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">Buscar</button>
        </form>
        <button type="button" className="btn btn-primary" onClick={abrirNovo}>
          + Novo colaborador
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando colaboradores...</div>
          ) : colaboradoresFiltrados.length === 0 ? (
            <div className="empty-state">
              {busca.trim() || filtroFuncao
                ? 'Nenhum colaborador encontrado para os filtros aplicados.'
                : 'Nenhum colaborador cadastrado.'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Função</th>
                  <th>Usuário</th>
                  <th>Salário</th>
                  <th>Benefícios</th>
                  <th>Total mensal</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {colaboradoresFiltrados.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.nome}</strong></td>
                    <td>{FUNCAO_COLABORADOR_LABEL[c.funcao] || c.funcao}</td>
                    <td>
                      {c.usuario_nome
                        ? `${c.usuario_nome} (${c.usuario_login})`
                        : <span className="hint-text">—</span>}
                    </td>
                    <td>{formatCurrency(c.salario_base)}</td>
                    <td>{formatCurrency(c.total_beneficios)}</td>
                    <td><strong>{formatCurrency(c.remuneracao_total)}</strong></td>
                    <td>{c.ativo ? 'Ativo' : 'Inativo'}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        onClick={() => abrirEdicao(c.id)}
                      >
                        Editar
                      </button>
                      {c.ativo !== false && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm text-danger"
                          disabled={deletingId === c.id}
                          onClick={() => handleDelete(c.id, c.nome)}
                        >
                          {deletingId === c.id ? 'Desativando...' : 'Desativar'}
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
        <ColaboradorModal
          colaborador={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
