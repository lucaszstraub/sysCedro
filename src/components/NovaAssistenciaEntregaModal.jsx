import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { formatDate, toInputDate } from '../utils/format';

function hojeIso() {
  return toInputDate(new Date());
}

export default function NovaAssistenciaEntregaModal({ onClose, onCreated }) {
  const [vendas, setVendas] = useState([]);
  const [vendaId, setVendaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataPrevista, setDataPrevista] = useState(hojeIso);
  const [observacoesKanban, setObservacoesKanban] = useState('');
  const [flagUrgencia, setFlagUrgencia] = useState(false);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listVendas('');
        setVendas(data.filter((v) => v.status === 'confirmada' || v.status === 'entregue'));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return vendas;
    return vendas.filter((v) => {
      const haystack = [v.numero, v.numero_pedido, v.cliente_nome].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(termo);
    });
  }, [vendas, busca]);

  const vendaSelecionada = vendas.find((v) => String(v.id) === String(vendaId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const criada = await api.criarAssistenciaEntrega({
        venda_id: Number(vendaId),
        descricao_assistencia: descricao.trim(),
        data_prevista: dataPrevista,
        observacoes_kanban: observacoesKanban.trim() || null,
        flag_urgencia: flagUrgencia,
        itens: [],
      });
      onCreated(criada);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Nova assistência técnica</h3>
            <p className="picker-subtitle">Agende visita de assistência para uma venda já realizada</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body picker-body">
            {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

            <div className="picker-filters">
              <input
                className="search-input picker-search"
                placeholder="Pesquisar venda por número, pedido ou cliente..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="loading">Carregando vendas...</div>
            ) : (
              <div className="picker-grid">
                {filtradas.map((v) => (
                  <label
                    key={v.id}
                    className={`picker-card${String(vendaId) === String(v.id) ? ' is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="venda_assistencia"
                      value={v.id}
                      checked={String(vendaId) === String(v.id)}
                      onChange={() => setVendaId(String(v.id))}
                    />
                    <strong>{v.numero_pedido || v.numero}</strong>
                    <span>{v.cliente_nome}</span>
                    <span className="hint-text">{formatDate(v.criado_em)}</span>
                  </label>
                ))}
              </div>
            )}

            {vendaSelecionada && (
              <div className="form-grid" style={{ marginTop: '1rem' }}>
                <div className="form-group full-width">
                  <label htmlFor="descricao-assistencia">Descrição da assistência *</label>
                  <textarea
                    id="descricao-assistencia"
                    rows={3}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="data-assistencia">Agendar para</label>
                  <input
                    id="data-assistencia"
                    type="date"
                    value={dataPrevista}
                    onChange={(e) => setDataPrevista(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={flagUrgencia}
                      onChange={(e) => setFlagUrgencia(e.target.checked)}
                    />
                    Marcar como urgência
                  </label>
                </div>
                <div className="form-group full-width">
                  <label htmlFor="obs-kanban">Observações do card</label>
                  <textarea
                    id="obs-kanban"
                    rows={2}
                    value={observacoesKanban}
                    onChange={(e) => setObservacoesKanban(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !vendaId}>
              {saving ? 'Agendando...' : 'Agendar assistência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
