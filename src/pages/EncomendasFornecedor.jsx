import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { STATUS_OPTIONS } from '../constants/encomenda';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import { formatDate } from '../utils/format';

const base = '/gestao-estoque/encomendas';

export default function EncomendasFornecedor() {
  const [encomendas, setEncomendas] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [generatingPdfId, setGeneratingPdfId] = useState(null);
  const { confirm, success: showSuccess, runWithFeedback } = useFeedback();

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const [lista, res] = await Promise.all([
        api.listEncomendasFornecedor(term),
        api.getResumoPendenciasEncomenda(),
      ]);
      setEncomendas(lista);
      setResumo(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleGerarPdf = async (encomendaId) => {
    setGeneratingPdfId(encomendaId);
    setError('');
    try {
      await runWithFeedback(
        async () => {
          const result = await api.gerarPdfEncomendaFornecedor(encomendaId);
          if (result.cancelled) return result;
          return result;
        },
        {
          loading: 'Gerando PDF do pedido...',
          success: 'PDF gerado com sucesso.',
          error: 'Não foi possível gerar o PDF.',
        }
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const handleDelete = async (id, numero) => {
    const ok = await confirm({
      title: 'Excluir encomenda',
      message: `Deseja excluir a encomenda ${numero}? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir encomenda',
      cancelLabel: 'Manter',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingId(id);
    setError('');
    try {
      await api.deleteEncomendaFornecedor(id);
      showSuccess(`Encomenda ${numero} excluída.`);
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
        <h2>Encomendas a fornecedores</h2>
        <p>Pedidos aos fornecedores — vincule itens de vendas ou cadastre reposição de estoque</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {resumo && !resumo.todos_encomendados && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <strong>{resumo.total_unidades_pendentes}</strong> unidade(s) de venda ainda não foram encomendadas ao fornecedor.{' '}
          <Link to={`${base}/pendencias`}>Ver pendências</Link>
        </div>
      )}

      {resumo?.todos_encomendados && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          Todos os itens vendidos para encomenda já foram vinculados a pedidos de fornecedor.
        </div>
      )}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar por número ou fornecedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <Link to={`${base}/pendencias`} className="btn btn-secondary">Pendências de encomenda</Link>
        <Link to={`${base}/nova`} className="btn btn-primary">+ Nova encomenda</Link>
        <Link to="/gestao-estoque/recebimentos" className="btn btn-secondary">Recebimentos</Link>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando encomendas...</div>
          ) : encomendas.length === 0 ? (
            <div className="empty-state empty-state-cta">
              <p>
                {busca.trim()
                  ? 'Nenhuma encomenda encontrada para esta busca.'
                  : 'Nenhuma encomenda cadastrada ainda.'}
              </p>
              {!busca.trim() && (
                <Link to={`${base}/nova`} className="btn btn-primary">
                  Cadastrar primeira encomenda
                </Link>
              )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fornecedor</th>
                  <th>Status</th>
                  <th>Itens</th>
                  <th>Unidades</th>
                  <th>Previsão</th>
                  <th>Criado em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {encomendas.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.numero}</strong></td>
                    <td>{e.fornecedor_nome}</td>
                    <td>{STATUS_OPTIONS.find((s) => s.value === e.status)?.label || e.status}</td>
                    <td>{e.total_itens}</td>
                    <td>{e.total_unidades}</td>
                    <td>{formatDate(e.previsao_entrega)}</td>
                    <td>{formatDate(e.criado_em)}</td>
                    <td>
                      <Link to={`${base}/${e.id}`} className="btn btn-secondary btn-sm">Editar</Link>
                      {' '}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleGerarPdf(e.id)}
                        disabled={generatingPdfId === e.id}
                      >
                        {generatingPdfId === e.id ? 'Gerando PDF...' : 'Gerar PDF'}
                      </button>
                      {' '}
                      {e.status !== 'recebida' && e.status !== 'cancelada' && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(e.id, e.numero)}
                          disabled={deletingId === e.id}
                        >
                          {deletingId === e.id ? 'Excluindo...' : 'Excluir'}
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
    </>
  );
}
