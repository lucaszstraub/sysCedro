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
import { formatDate, formatDateTime } from '../utils/format';
import AlocarProdutoModal from '../components/AlocarProdutoModal';
import MovimentacaoModal from '../components/MovimentacaoModal';

export default function Movimentacoes() {
  const [pendencias, setPendencias] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [localizacoes, setLocalizacoes] = useState([]);
  const [buscaPendencias, setBuscaPendencias] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [itemAlocar, setItemAlocar] = useState(null);
  const [modalMovimentacao, setModalMovimentacao] = useState(false);
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
      const [p, m, prod, locs] = await Promise.all([
        api.listPendenciasAlocacao(term),
        api.listMovimentacoes(100),
        api.listProdutos(''),
        api.listLocalizacoes(),
      ]);
      setPendencias(p);
      setMovimentacoes(m);
      setProdutos(prod);
      setLocalizacoes(locs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAlocar = async (data) => {
    await api.alocarProduto(data);
    setItemAlocar(null);
    showSuccess('Produto alocado com sucesso no endereço de estoque.');
    await load();
  };

  const handleSaveMovimentacao = async (data) => {
    await api.createMovimentacao(data);
    setModalMovimentacao(false);
    showSuccess('Movimentação registrada com sucesso!');
    await load();
  };

  const handleBuscaPendencias = (e) => {
    e.preventDefault();
    load(buscaPendencias);
  };

  return (
    <>
      <header className="page-header">
        <h2>Alocação e movimentações</h2>
        <p>
          Produtos recebidos ficam em <strong>Não alocados</strong> até serem guardados em um endereço do armazém
        </p>
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
          Alocar reduz o risco de extravio e libera a área de recebimento.
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
                        onClick={() => setItemAlocar(p)}
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
        <h3 className="section-inline-title">Outras movimentações</h3>
        <button type="button" className="btn btn-secondary" onClick={() => setModalMovimentacao(true)}>
          + Saída, transferência ou ajuste
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
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Origem</th>
                  <th>Destino</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.criado_em)}</td>
                    <td>
                      <span className={`badge ${badgeClassMovimentacao(m)}`}>
                        {labelTipoMovimentacao(m)}
                      </span>
                    </td>
                    <td>{m.sku} — {m.produto_nome}</td>
                    <td>{m.quantidade}</td>
                    <td>{m.origem_codigo || '—'}</td>
                    <td>{m.destino_codigo || '—'}</td>
                    <td>{m.motivo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {itemAlocar && (
        <AlocarProdutoModal
          item={itemAlocar}
          localizacoesDestino={localizacoesDestino}
          onClose={() => setItemAlocar(null)}
          onConfirm={handleAlocar}
        />
      )}

      {modalMovimentacao && (
        <MovimentacaoModal
          produtos={produtos}
          localizacoes={localizacoes}
          localizacoesDestino={localizacoesDestino}
          onClose={() => setModalMovimentacao(false)}
          onSave={handleSaveMovimentacao}
        />
      )}
    </>
  );
}
