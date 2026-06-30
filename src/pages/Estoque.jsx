import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageAlert from '../components/PageAlert';
import { CODIGO_LOCALIZACAO_NAO_ALOCADOS, isLocalizacaoNaoAlocados } from '../constants/estoque';
import { formatDate } from '../utils/format';

export default function Estoque() {
  const [itens, setItens] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (term = busca) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listEstoque(term);
      setItens(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const itensFiltrados = useMemo(() => {
    if (filtro === 'nao_alocados') {
      return itens.filter((i) => i.localizacao_codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS);
    }
    if (filtro === 'alocados') {
      return itens.filter((i) => i.localizacao_codigo !== CODIGO_LOCALIZACAO_NAO_ALOCADOS);
    }
    return itens;
  }, [itens, filtro]);

  const totalGeral = itensFiltrados.reduce((sum, i) => sum + i.quantidade, 0);
  const totalNaoAlocados = itens
    .filter((i) => i.localizacao_codigo === CODIGO_LOCALIZACAO_NAO_ALOCADOS)
    .reduce((sum, i) => sum + i.quantidade, 0);

  return (
    <>
      <header className="page-header">
        <h2>Estoque</h2>
        <p>Posição de estoque por produto e localização</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      {totalNaoAlocados > 0 && (
        <div className="alert alert-warning alocacao-alert">
          <strong>{totalNaoAlocados} unidade(s)</strong> ainda em Não alocados.
          {' '}
          <Link to="/gestao-estoque/movimentacoes">Ir para alocação</Link>
        </div>
      )}

      <div className="stats-grid" style={{ maxWidth: 560 }}>
        <div className="stat-card">
          <div className="label">Total listado</div>
          <div className="value">{totalGeral}</div>
        </div>
        <div className={`stat-card ${totalNaoAlocados > 0 ? 'stat-card-priority' : ''}`}>
          <div className="label">Em Não alocados</div>
          <div className="value">{totalNaoAlocados}</div>
        </div>
      </div>

      <div className="toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(busca); }}>
          <input
            className="search-input"
            placeholder="Buscar produto, SKU ou localização..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </form>
        <select
          className="filter-select"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          aria-label="Filtrar estoque"
        >
          <option value="todos">Todas as localizações</option>
          <option value="nao_alocados">Só Não alocados</option>
          <option value="alocados">Só endereços definitivos</option>
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando estoque...</div>
          ) : itensFiltrados.length === 0 ? (
            <div className="empty-state">Nenhum item em estoque</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Produto</th>
                  <th>Localização</th>
                  <th>Quantidade</th>
                  <th>Mínimo</th>
                  <th>Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {itensFiltrados.map((item) => {
                  const naoAlocado = isLocalizacaoNaoAlocados({ codigo: item.localizacao_codigo });
                  return (
                    <tr key={item.id} className={naoAlocado ? 'row-pendencia-alocacao' : ''}>
                      <td><strong>{item.sku}</strong></td>
                      <td>{item.produto_nome}</td>
                      <td>
                        {naoAlocado ? (
                          <span className="badge badge-nao-alocados">{item.localizacao_codigo}</span>
                        ) : (
                          <>{item.localizacao_codigo}</>
                        )}
                        {' — '}{item.localizacao_nome}
                      </td>
                      <td>
                        <span className={
                          naoAlocado
                            ? 'badge badge-a-receber'
                            : item.quantidade <= item.estoque_minimo
                              ? 'badge badge-warning'
                              : ''
                        }>
                          {item.quantidade}
                        </span>
                      </td>
                      <td>{item.estoque_minimo}</td>
                      <td>{formatDate(item.atualizado_em)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
