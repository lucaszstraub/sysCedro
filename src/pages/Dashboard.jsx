import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageAlert from '../components/PageAlert';
import PageHero from '../components/PageHero';
import { formatDate, TIPO_MOVIMENTACAO } from '../utils/format';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDashboard()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <PageHero
          eyebrow="Operação"
          title="Painel"
          subtitle="Visão geral do armazém da loja de móveis"
        />
        <div className="loading">Carregando painel...</div>
      </>
    );
  }
  if (error) return <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>;
  if (!data) return null;

  return (
    <>
      <PageHero
        eyebrow="Operação"
        title="Painel"
        subtitle="Visão geral do armazém da loja de móveis"
        actions={(
          <>
            <Link to="/gestao-estoque/movimentacoes" className="btn btn-secondary">
              Movimentações
            </Link>
            <Link to="/gestao-estoque/estoque" className="btn btn-secondary">
              Estoque
            </Link>
          </>
        )}
      />

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Produtos ativos</div>
          <div className="value">{data.totalProdutos}</div>
        </div>
        <div className="stat-card">
          <div className="label">Itens em estoque</div>
          <div className="value">{data.totalItensEstoque}</div>
        </div>
        <div className={`stat-card ${data.pendenciasAlocacao?.produtos > 0 ? 'stat-card-priority' : ''}`}>
          <div className="label">Aguardando alocação</div>
          <div className="value" style={{ color: data.pendenciasAlocacao?.produtos > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {data.pendenciasAlocacao?.produtos || 0}
          </div>
          {data.pendenciasAlocacao?.unidades > 0 && (
            <div className="hint-text">{data.pendenciasAlocacao.unidades} un. em Não alocados</div>
          )}
        </div>
        <div className="stat-card">
          <div className="label">Alertas de estoque</div>
          <div className="value" style={{ color: data.estoqueBaixo.length ? 'var(--danger)' : 'var(--success)' }}>
            {data.estoqueBaixo.length}
          </div>
        </div>
      </div>

      {data.pendenciasAlocacao?.produtos > 0 && (
        <div className="alert alert-warning alocacao-alert" style={{ marginBottom: '1.5rem' }}>
          <strong>{data.pendenciasAlocacao.produtos} produto(s)</strong> recebido(s) aguardam endereço definitivo
          ({data.pendenciasAlocacao.unidades} unidades em Não alocados).
          {' '}
          <Link to="/gestao-estoque/movimentacoes">Alocar agora</Link>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-header">Produtos com estoque baixo</div>
          <div className="card-body" style={{ padding: 0 }}>
            {data.estoqueBaixo.length === 0 ? (
              <div className="empty-state">Nenhum produto abaixo do mínimo</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.estoqueBaixo.map((p) => (
                    <tr key={p.id}>
                      <td>{p.sku}</td>
                      <td>{p.nome}</td>
                      <td><span className="badge badge-warning">{p.quantidade}</span></td>
                      <td>{p.estoque_minimo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">Movimentações recentes</div>
          <div className="card-body" style={{ padding: 0 }}>
            {data.movimentacoesRecentes.length === 0 ? (
              <div className="empty-state">Nenhuma movimentação registrada</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movimentacoesRecentes.map((m) => (
                    <tr key={m.id}>
                      <td><span className={`badge badge-${m.tipo}`}>{TIPO_MOVIMENTACAO[m.tipo]}</span></td>
                      <td>{m.produto_nome}</td>
                      <td>{m.quantidade}</td>
                      <td>{formatDate(m.criado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Produtos por categoria</div>
        <div className="card-body">
          <div className="stats-grid">
            {data.produtosPorCategoria.map((c) => (
              <div key={c.nome} className="stat-card">
                <div className="label">{c.nome}</div>
                <div className="value">{c.total}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
