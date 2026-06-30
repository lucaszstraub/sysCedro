import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { KANBAN_COLUMNS, resolverColunaKanban } from '../constants/orcamentoPlanejado';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import OrcamentoPlanejadoKanbanCard from '../components/OrcamentoPlanejadoKanbanCard';
import { VENDEDOR_CLASSIFICACAO_PLANEJADOS } from '../constants/vendedor';
import { loadVendedoresPorClassificacao } from '../utils/loadVendedores';
import { isVendedorRestrito } from '../utils/vendedorRestrito';

const REFRESH_INTERVAL_MS = 60_000;

export default function OrcamentosPlanejados() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const vendedorRestrito = isVendedorRestrito(user);
  const [orcamentos, setOrcamentos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [busca, setBusca] = useState('');
  const [vendedorFiltro, setVendedorFiltro] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { success: showSuccess } = useFeedback();

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const lista = await api.listOrcamentosPlanejados(term);
      setOrcamentos(lista);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const vendedoresLista = await loadVendedoresPorClassificacao(
          api,
          VENDEDOR_CLASSIFICACAO_PLANEJADOS
        );
        setVendedores(vendedoresLista);
        await load();
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => load(busca), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [busca]);

  const orcamentosFiltrados = useMemo(() => {
    if (!vendedorFiltro) return orcamentos;
    if (vendedorFiltro === 'sem') {
      return orcamentos.filter((o) => !o.vendedor_id);
    }
    return orcamentos.filter((o) => String(o.vendedor_id) === vendedorFiltro);
  }, [orcamentos, vendedorFiltro]);

  const porColuna = useMemo(() => {
    const map = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c.id, []]));
    orcamentosFiltrados.forEach((o) => {
      const col = resolverColunaKanban(o);
      if (map[col]) map[col].push(o);
    });
    return map;
  }, [orcamentosFiltrados]);

  const handleDragStart = (e, orcamento) => {
    e.dataTransfer.setData('text/plain', String(orcamento.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, aceitaDrop) => {
    if (!aceitaDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const moverParaColuna = async (orcamentoId, colunaId) => {
    const coluna = KANBAN_COLUMNS.find((c) => c.id === colunaId);
    if (!coluna?.aceitaDrop) return;

    const orc = orcamentos.find((o) => o.id === Number(orcamentoId));
    if (!orc) return;

    if (colunaId === 'encerrado') {
      if (orc.status === 'recusado') return;
    } else if (resolverColunaKanban(orc) === colunaId) {
      return;
    }

    const payload = { coluna: colunaId };
    if (coluna.motivoDrop) {
      payload.motivo_encerramento = coluna.motivoDrop;
    }

    try {
      await api.moverOrcamentoPlanejadoKanban(orc.id, payload);
      showSuccess(`Orçamento ${orc.numero} movido para ${coluna.title}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDrop = (e, coluna) => {
    if (!coluna.aceitaDrop) return;
    e.preventDefault();
    e.stopPropagation();
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (!id) return;
    moverParaColuna(id, coluna.id);
  };

  const handleIniciarVenda = (orcamento) => {
    navigate(`/ferramentas-venda/vendas-planejados/novo?orcamento_planejado=${orcamento.id}`);
  };

  return (
    <>
      <header className="page-header">
        <h2>Orçamentos — Móveis planejados</h2>
        <p>Kanban exclusivo para móveis sob medida, cadastrados item a item no orçamento</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }} className="toolbar-filters">
          <input
            className="search-input"
            placeholder="Buscar por número ou cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {!vendedorRestrito && (
            <select
              className="filter-select"
              value={vendedorFiltro}
              onChange={(e) => setVendedorFiltro(e.target.value)}
              aria-label="Filtrar por vendedor"
            >
              <option value="">Todos os vendedores</option>
              <option value="sem">Sem vendedor</option>
              {vendedores.map((v) => (
                <option key={v.id} value={String(v.id)}>{v.nome}</option>
              ))}
            </select>
          )}
        </form>
        <Link to="/ferramentas-venda/orcamentos-planejados/novo" className="btn btn-primary">
          + Novo orçamento planejado
        </Link>
      </div>

      {loading ? (
        <div className="loading">Carregando quadro...</div>
      ) : (
        <div className="kanban-board">
          {KANBAN_COLUMNS.map((coluna) => (
            <section
              key={coluna.id}
              className={`kanban-column ${coluna.id === 'aprovado' ? 'kanban-column-highlight' : ''} ${coluna.id === 'encerrado' ? 'kanban-column-muted' : ''}`}
              onDragOver={(e) => handleDragOver(e, coluna.aceitaDrop)}
              onDrop={(e) => handleDrop(e, coluna)}
            >
              <header className="kanban-column-header">
                <h3>{coluna.title}</h3>
                <span className="kanban-column-count">{porColuna[coluna.id]?.length || 0}</span>
              </header>
              <div
                className="kanban-column-body"
                onDragOver={(e) => handleDragOver(e, coluna.aceitaDrop)}
                onDrop={(e) => handleDrop(e, coluna)}
              >
                {(porColuna[coluna.id] || []).length === 0 ? (
                  <div
                    className="kanban-column-empty"
                    onDragOver={(e) => handleDragOver(e, coluna.aceitaDrop)}
                    onDrop={(e) => handleDrop(e, coluna)}
                  >
                    {coluna.id === 'encerrado'
                      ? 'Arraste aqui para rejeitar ou aguarde a expiração automática'
                      : 'Arraste cards para cá'}
                  </div>
                ) : (
                  porColuna[coluna.id].map((o) => (
                    <OrcamentoPlanejadoKanbanCard
                      key={o.id}
                      orcamento={o}
                      onDragStart={handleDragStart}
                      onDragOver={(e) => handleDragOver(e, coluna.aceitaDrop)}
                      onDrop={(e) => handleDrop(e, coluna)}
                      onIniciarVenda={handleIniciarVenda}
                    />
                  ))
                )}
              </div>
              {coluna.id === 'aprovado' && (
                <p className="hint-text kanban-column-hint">
                  Orçamentos aprovados podem iniciar a venda planejada. Após salvar a venda, o número dela aparece no card.
                </p>
              )}
              {coluna.id === 'encerrado' && (
                <p className="hint-text kanban-column-hint">
                  Arraste para rejeitar manualmente. Vencidos entram aqui automaticamente com a flag de expirado.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
