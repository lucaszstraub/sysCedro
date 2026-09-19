import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
  CODIGO_LOCALIZACAO_NAO_ALOCADOS,
  badgeClassMovimentacao,
  labelTipoMovimentacao,
} from '../constants/estoque';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import { formatDateTime } from '../utils/format';
import MovimentacaoModal from '../components/MovimentacaoModal';

export default function Movimentacoes() {
  const [pendencias, setPendencias] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [localizacoes, setLocalizacoes] = useState([]);
  const [buscaPendencias, setBuscaPendencias] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalMovimentacao, setModalMovimentacao] = useState(null);
  const { success: showSuccess } = useFeedback();

  const localizacoesDestino = useMemo(
    () => localizacoes.filter((l) => l.codigo !== CODIGO_LOCALIZACAO_NAO_ALOCADOS),
    [localizacoes]
  );

  const totalUnidadesPendentes = useMemo(
    () => pendencias.reduce((sum, p) => sum + Number(p.quantidade), 0),
    [pendencias]
  );

  const load = async (term = buscaPendencias) => {
    setLoading(true);
    setError('');
    try {
      const [p, m, locs] = await Promise.all([
        api.listPendenciasAlocacao(term),
        api.listMovimentacoes(100),
        api.listLocalizacoes(),
      ]);
      setPendencias(p);
      setMovimentacoes(m);
      setLocalizacoes(locs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSaveMovimentacao = async (data) => {
    const linhas = Array.isArray(data.linhas) ? data.linhas : [];
    if (linhas.length === 0) throw new Error('Informe ao menos uma quantidade de origem.');

    for (const linha of linhas) {
      await api.createMovimentacao({
        tipo: data.tipo,
        produto_id: data.produto_id,
        quantidade: linha.quantidade,
        localizacao_origem_id: linha.localizacao_origem_id,
        localizacao_destino_id: data.localizacao_destino_id,
        motivo: data.motivo,
        usuario: data.usuario || 'operador',
        data_movimento: data.data_movimento,
      });
    }

    setModalMovimentacao(null);
    const total = linhas.reduce((sum, l) => sum + Number(l.quantidade), 0);
    const msg = data.tipo === 'entregue'
      ? `Entregue registrado: ${total} un. (estoque e compromisso atualizados).`
      : `Movimentação registrada: ${total} un.`;
    showSuccess(msg);
    await load();
  };

  const handleBuscaPendencias = (e) => {
    e.preventDefault();
    load(buscaPendencias);
  };

  const abrirMoverProduto = (produto = null, { alocarPendencia = false } = {}) => {
    setModalMovimentacao({
      produto: produto
        ? { id: produto.produto_id || produto.id, sku: produto.sku, nome: produto.produto_nome || produto.nome }
        : null,
      sugerirDeNaoAlocados: alocarPendencia,
    });
  };

  return (
    <>
      <header className="page-header visao-vendas-header">
        <div>
          <h2>Alocação e movimentações</h2>
          <p>
            Busque o produto, escolha quanto sair de cada localização e defina o destino
            (endereço ou <strong>Entregue</strong>).
          </p>
        </div>
        <div className="visao-vendas-header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => abrirMoverProduto()}
          >
            Mover produto
          </button>
          <Link to="/gestao-estoque/estoque" className="btn btn-secondary">
            Voltar ao estoque
          </Link>
        </div>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="stats-grid alocacao-stats">
        <div className={`stat-card ${pendencias.length > 0 ? 'stat-card-priority' : ''}`}>
          <div className="label">Produtos aguardando alocação</div>
          <div className="value">{pendencias.length}</div>
        </div>
        <div className={`stat-card ${totalUnidadesPendentes > 0 ? 'stat-card-priority' : ''}`}>
          <div className="label">Unidades em &quot;Não alocados&quot;</div>
          <div className="value">{totalUnidadesPendentes}</div>
        </div>
        <div className="stat-card">
          <div className="label">Endereços disponíveis</div>
          <div className="value">{localizacoesDestino.length}</div>
        </div>
      </div>

      {pendencias.length > 0 && (
        <div className="alert alert-warning alocacao-alert">
          <strong>Prioridade:</strong> há {pendencias.length} produto(s) recebido(s) aguardando endereço definitivo.
          Use <strong>Alocar</strong> para mover de Não alocados para um endereço.
        </div>
      )}

      <div className="card alocacao-card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header card-header-priority">
          <span>Pendências de alocação</span>
          <span className="badge badge-a-receber">{pendencias.length} pendente(s)</span>
        </div>
        <div className="card-body">
          <form onSubmit={handleBuscaPendencias} className="toolbar" style={{ marginBottom: '1rem' }}>
            <input
              className="search-input"
              placeholder="Buscar SKU ou produto aguardando alocação..."
              value={buscaPendencias}
              onChange={(e) => setBuscaPendencias(e.target.value)}
            />
          </form>

          {loading ? (
            <div className="loading">Carregando pendências...</div>
          ) : pendencias.length === 0 ? (
            <div className="empty-state">
              {buscaPendencias.trim()
                ? 'Nenhum produto encontrado nesta busca.'
                : (
                  <>
                    Nenhum produto aguardando alocação. Quando um recebimento for confirmado,
                    o item aparecerá aqui em <strong>Não alocados</strong>.
                    {' '}
                    <Link to="/gestao-estoque/recebimentos">Ir para recebimentos</Link>
                  </>
                )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd aguardando</th>
                  <th>Chegou em</th>
                  <th>Origem</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendencias.map((p) => (
                  <tr key={p.estoque_id} className="row-pendencia-alocacao">
                    <td>
                      <strong>{p.sku}</strong>
                      <br />
                      {p.produto_nome}
                    </td>
                    <td>
                      <span className="badge badge-a-receber">{p.quantidade}</span>
                    </td>
                    <td>{formatDateTime(p.ultimo_recebimento_em || p.atualizado_em)}</td>
                    <td>
                      <span className="badge badge-nao-alocados">{p.localizacao_codigo}</span>
                      <span className="hint-text" style={{ display: 'block' }}>{p.localizacao_nome}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => abrirMoverProduto(p, { alocarPendencia: true })}
                      >
                        Alocar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="toolbar">
        <h3 className="section-inline-title">Histórico</h3>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => abrirMoverProduto()}
        >
          + Mover produto
        </button>
      </div>

      <div className="card">
        <div className="card-header">Histórico de movimentações</div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading">Carregando movimentações...</div>
          ) : movimentacoes.length === 0 ? (
            <div className="empty-state">Nenhuma movimentação registrada ainda.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Tipo</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Origem</th>
                  <th>Destino</th>
                  <th>Motivo</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <time dateTime={m.criado_em}>{formatDateTime(m.criado_em)}</time>
                    </td>
                    <td>
                      <span className={`badge ${badgeClassMovimentacao(m)}`}>
                        {labelTipoMovimentacao(m)}
                      </span>
                    </td>
                    <td>{m.sku} — {m.produto_nome}</td>
                    <td>{m.quantidade}</td>
                    <td>{m.origem_codigo || '—'}</td>
                    <td>
                      {m.referencia_tipo === 'entregue'
                        ? 'Entregue'
                        : (m.destino_codigo || '—')}
                    </td>
                    <td>{m.motivo || '—'}</td>
                    <td>{m.usuario || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalMovimentacao && (
        <MovimentacaoModal
          localizacoesDestino={localizacoesDestino}
          initialProduto={modalMovimentacao.produto}
          sugerirDeNaoAlocados={Boolean(modalMovimentacao.sugerirDeNaoAlocados)}
          onClose={() => setModalMovimentacao(null)}
          onSave={handleSaveMovimentacao}
        />
      )}
    </>
  );
}
