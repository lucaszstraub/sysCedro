import { InlineAlert } from './PageAlert';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { formatDateTime } from '../utils/format';

function isAutorAnotacao(anotacao, user) {
  if (!user) return false;
  if (anotacao.autor_usuario_id != null) {
    return Number(anotacao.autor_usuario_id) === Number(user.id);
  }
  const autor = (anotacao.autor_nome || '').trim().toLowerCase();
  return [user.nome, user.login]
    .filter(Boolean)
    .some((nome) => nome.trim().toLowerCase() === autor);
}

export default function AcompanhamentoPedidoObservacoesModal({ pedido, onClose, onUpdated }) {
  const { user } = useAuth();
  const { confirm } = useFeedback();
  const [anotacoes, setAnotacoes] = useState([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [salvandoEdicaoId, setSalvandoEdicaoId] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setAnotacoes(await api.listAcompanhamentoPedidoAnotacoes(pedido.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [pedido.id]);

  const notifyUpdated = async () => {
    await load();
    onUpdated?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.adicionarAcompanhamentoPedidoAnotacao(pedido.id, texto.trim());
      setTexto('');
      await notifyUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const iniciarEdicao = (anotacao) => {
    setEditandoId(anotacao.id);
    setTextoEdicao(anotacao.texto);
    setError('');
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setTextoEdicao('');
  };

  const salvarEdicao = async (anotacaoId) => {
    if (!textoEdicao.trim()) return;
    setSalvandoEdicaoId(anotacaoId);
    setError('');
    try {
      await api.atualizarAcompanhamentoPedidoAnotacao(anotacaoId, textoEdicao.trim());
      cancelarEdicao();
      await notifyUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSalvandoEdicaoId(null);
    }
  };

  const excluirAnotacao = async (anotacao) => {
    const ok = await confirm({
      title: 'Excluir observação',
      message: 'Deseja excluir esta observação? Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      cancelLabel: 'Manter',
      variant: 'danger',
    });
    if (!ok) return;

    setExcluindoId(anotacao.id);
    setError('');
    try {
      if (editandoId === anotacao.id) cancelarEdicao();
      await api.excluirAcompanhamentoPedidoAnotacao(anotacao.id);
      await notifyUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setExcluindoId(null);
    }
  };

  const titulo = pedido.tipo === 'assistencia' ? pedido.numero : pedido.venda_numero;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Observações — {titulo}</h3>
            <p className="picker-subtitle">{pedido.cliente_nome}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          <form onSubmit={handleSubmit} className="observacoes-form">
            <div className="form-group">
              <label>Nova observação</label>
              <textarea
                rows={3}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Registre atualizações, pendências ou contatos..."
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving || !texto.trim()}>
              {saving ? 'Salvando...' : 'Adicionar observação'}
            </button>
          </form>

          <div className="observacoes-list">
            <h4>Histórico</h4>
            {loading ? (
              <div className="loading">Carregando...</div>
            ) : anotacoes.length === 0 ? (
              <div className="empty-state">Nenhuma observação registrada.</div>
            ) : (
              <ul className="observacoes-timeline">
                {anotacoes.map((a) => {
                  const podeEditar = isAutorAnotacao(a, user);
                  const emEdicao = editandoId === a.id;

                  return (
                    <li key={a.id} className="observacao-item">
                      <div className="observacao-meta">
                        <div>
                          <strong>{a.autor_nome || 'Usuário'}</strong>
                          <span className="hint-text">
                            {' '}
                            {formatDateTime(a.criado_em)}
                            {a.atualizado_em ? ` · editado em ${formatDateTime(a.atualizado_em)}` : ''}
                          </span>
                        </div>
                        {podeEditar && !emEdicao && (
                          <div className="observacao-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => iniciarEdicao(a)}
                              disabled={excluindoId === a.id}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => excluirAnotacao(a)}
                              disabled={excluindoId === a.id}
                            >
                              {excluindoId === a.id ? 'Excluindo...' : 'Excluir'}
                            </button>
                          </div>
                        )}
                      </div>

                      {emEdicao ? (
                        <div className="observacao-edicao">
                          <textarea
                            rows={3}
                            value={textoEdicao}
                            onChange={(e) => setTextoEdicao(e.target.value)}
                          />
                          <div className="observacao-edicao-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => salvarEdicao(a.id)}
                              disabled={salvandoEdicaoId === a.id || !textoEdicao.trim()}
                            >
                              {salvandoEdicaoId === a.id ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={cancelarEdicao}
                              disabled={salvandoEdicaoId === a.id}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p>{a.texto}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
