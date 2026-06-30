import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ESTOQUE_BASE, VENDAS_BASE } from '../constants/auth';
import { useFeedback } from '../context/FeedbackContext';
import PageAlert from '../components/PageAlert';
import ArquivoPreview from '../components/ArquivoPreview';

const TIPO_LABEL = {
  venda: 'Venda',
  encomenda_fornecedor: 'Encomenda',
};

const MOTIVO_LABEL = {
  exclusao: 'Exclusão',
  alteracao: 'Alteração',
};

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

function linkRegistroAtual(tipo, entidadeId) {
  if (!entidadeId) return null;
  if (tipo === 'venda') return `${VENDAS_BASE}/vendas/${entidadeId}/editar`;
  if (tipo === 'encomenda_fornecedor') return `${ESTOQUE_BASE}/encomendas/${entidadeId}`;
  return null;
}

function ListaAlteracoes({ alteracoes, compact = false }) {
  if (!alteracoes?.length) return null;
  const itens = compact ? alteracoes.slice(0, 3) : alteracoes;

  return (
    <ul className={`arquivo-alteracoes-lista${compact ? ' compact' : ''}`}>
      {itens.map((texto, idx) => (
        <li key={`${texto}-${idx}`}>{texto}</li>
      ))}
      {compact && alteracoes.length > 3 && (
        <li className="hint-text">+ {alteracoes.length - 3} alteração(ões)</li>
      )}
    </ul>
  );
}

export default function Arquivo() {
  const [aba, setAba] = useState('exclusao');
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detalhe, setDetalhe] = useState(null);
  const [detalheLoading, setDetalheLoading] = useState(false);
  const [previewAbertoId, setPreviewAbertoId] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [previews, setPreviews] = useState({});
  const [restaurandoId, setRestaurandoId] = useState(null);
  const { confirm, success: showSuccess } = useFeedback();

  const filtros = useMemo(() => ({
    motivo: aba,
    tipo: tipo || null,
    busca,
  }), [aba, tipo, busca]);

  const load = async (nextFiltros = filtros) => {
    setLoading(true);
    setError('');
    try {
      setRegistros(await api.listArquivoRegistros(nextFiltros));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [aba, tipo]);

  const abrirDetalhe = async (id) => {
    setDetalheLoading(true);
    setError('');
    try {
      setDetalhe(await api.getArquivoRegistro(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDetalheLoading(false);
    }
  };

  const fecharDetalhe = () => setDetalhe(null);

  const carregarPreview = async (registro) => {
    if (previewAbertoId === registro.id) {
      setPreviewAbertoId(null);
      return;
    }

    if (previews[registro.id]) {
      setPreviewAbertoId(registro.id);
      return;
    }

    if (registro.preview) {
      setPreviews((prev) => ({ ...prev, [registro.id]: registro.preview }));
      setPreviewAbertoId(registro.id);
      return;
    }

    setPreviewLoadingId(registro.id);
    setError('');
    try {
      const completo = registro.preview
        ? registro
        : await api.getArquivoRegistro(registro.id);
      setPreviews((prev) => ({ ...prev, [registro.id]: completo.preview }));
      setPreviewAbertoId(registro.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleRestaurar = async (registro) => {
    const mensagem = registro.motivo === 'exclusao'
      ? `Recriar ${TIPO_LABEL[registro.tipo_entidade] || 'registro'} "${registro.titulo}" a partir desta cópia arquivada?`
      : `Substituir o registro atual pela versão de ${formatDateTime(registro.criado_em)}? A versão atual será arquivada antes da restauração.`;

    const ok = await confirm({
      title: 'Restaurar registro',
      message: mensagem,
      confirmLabel: 'Restaurar',
      cancelLabel: 'Cancelar',
      variant: 'warning',
    });
    if (!ok) return;

    setRestaurandoId(registro.id);
    setError('');
    try {
      const result = await api.restaurarArquivoRegistro(registro.id);
      showSuccess(result.mensagem);
      fecharDetalhe();
      setPreviewAbertoId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRestaurandoId(null);
    }
  };

  return (
    <>
      <header className="page-header">
        <h2>Arquivo / Lixeira</h2>
        <p>Consulte exclusões e versões anteriores de vendas e encomendas. Apenas administração.</p>
      </header>

      {error && <PageAlert onDismiss={() => setError('')}>{error}</PageAlert>}

      <div className="toolbar arquivo-toolbar">
        <div className="arquivo-tabs" role="tablist" aria-label="Tipo de arquivo">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'exclusao'}
            className={`btn ${aba === 'exclusao' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAba('exclusao')}
          >
            Excluídos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'alteracao'}
            className={`btn ${aba === 'alteracao' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAba('alteracao')}
          >
            Versões anteriores
          </button>
        </div>

        <form
          className="arquivo-filtros"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <select
            className="form-control"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos os tipos</option>
            <option value="venda">Vendas</option>
            <option value="encomenda_fornecedor">Encomendas</option>
          </select>
          <input
            type="search"
            className="form-control"
            placeholder="Buscar por número, título ou usuário"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">Buscar</button>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Carregando arquivo...</div>
        ) : registros.length === 0 ? (
          <p className="empty-state">
            {aba === 'exclusao'
              ? 'Nenhum registro excluído arquivado.'
              : 'Nenhuma versão anterior arquivada.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table arquivo-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Referência</th>
                  <th>O que mudou</th>
                  <th>Usuário</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {registros.map((registro) => (
                  <Fragment key={registro.id}>
                    <tr>
                      <td>{formatDateTime(registro.criado_em)}</td>
                      <td>{TIPO_LABEL[registro.tipo_entidade] || registro.tipo_entidade}</td>
                      <td>
                        <strong>{registro.numero_referencia || '—'}</strong>
                        <div className="text-muted text-sm">{registro.titulo}</div>
                      </td>
                      <td className="arquivo-descricao-cell">
                        <p className="arquivo-resumo-linha">{registro.resumo || '—'}</p>
                        <ListaAlteracoes alteracoes={registro.alteracoes} compact />
                      </td>
                      <td>{registro.usuario_nome || '—'}</td>
                      <td className="table-actions arquivo-acoes-cell">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => carregarPreview(registro)}
                          disabled={previewLoadingId === registro.id}
                        >
                          {previewLoadingId === registro.id
                            ? 'Carregando...'
                            : previewAbertoId === registro.id
                              ? 'Ocultar itens'
                              : 'Ver itens'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => abrirDetalhe(registro.id)}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                    {previewAbertoId === registro.id && previews[registro.id] && (
                      <tr key={`${registro.id}-preview`} className="arquivo-preview-row">
                        <td colSpan={6}>
                          <ArquivoPreview preview={previews[registro.id]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(detalhe || detalheLoading) && (
        <div className="modal-overlay" onClick={fecharDetalhe}>
          <div
            className="modal modal-lg arquivo-detalhe-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="arquivo-detalhe-titulo"
          >
            <div className="modal-header">
              <h3 id="arquivo-detalhe-titulo">
                {detalhe ? detalhe.titulo : 'Carregando...'}
              </h3>
              <button type="button" className="modal-close" onClick={fecharDetalhe} aria-label="Fechar">
                ×
              </button>
            </div>

            {detalheLoading && <div className="modal-body"><p>Carregando detalhes...</p></div>}

            {detalhe && !detalheLoading && (
              <>
                <div className="modal-body arquivo-detalhe-body">
                  <div className="arquivo-meta-grid">
                    <div>
                      <span className="label">Motivo</span>
                      <strong>{MOTIVO_LABEL[detalhe.motivo] || detalhe.motivo}</strong>
                    </div>
                    <div>
                      <span className="label">Arquivado em</span>
                      <strong>{formatDateTime(detalhe.criado_em)}</strong>
                    </div>
                    <div>
                      <span className="label">Usuário</span>
                      <strong>{detalhe.usuario_nome || '—'}</strong>
                    </div>
                    <div>
                      <span className="label">Tipo</span>
                      <strong>{TIPO_LABEL[detalhe.tipo_entidade] || detalhe.tipo_entidade}</strong>
                    </div>
                  </div>

                  {detalhe.resumo && (
                    <div className="arquivo-resumo">
                      <strong>Resumo</strong>
                      <p>{detalhe.resumo}</p>
                    </div>
                  )}

                  {detalhe.alteracoes?.length > 0 && (
                    <div className="arquivo-alteracoes-bloco">
                      <strong>
                        {detalhe.motivo === 'alteracao'
                          ? 'Alterações registradas'
                          : 'Detalhes'}
                      </strong>
                      <ListaAlteracoes alteracoes={detalhe.alteracoes} />
                    </div>
                  )}

                  <ArquivoPreview preview={detalhe.preview} />

                  {linkRegistroAtual(detalhe.tipo_entidade, detalhe.entidade_id) && detalhe.motivo === 'alteracao' && (
                    <p className="text-sm">
                      Registro atual:{' '}
                      <Link to={linkRegistroAtual(detalhe.tipo_entidade, detalhe.entidade_id)}>
                        abrir pedido
                      </Link>
                    </p>
                  )}

                  <details className="arquivo-json-details">
                    <summary>Ver dados completos arquivados (JSON)</summary>
                    <pre>{JSON.stringify(detalhe.dados, null, 2)}</pre>
                  </details>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={fecharDetalhe}>
                    Fechar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={restaurandoId === detalhe.id}
                    onClick={() => handleRestaurar(detalhe)}
                  >
                    {restaurandoId === detalhe.id ? 'Restaurando...' : 'Restaurar esta versão'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
