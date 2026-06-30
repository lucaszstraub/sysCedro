import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { formatCurrency, formatDate } from '../utils/format';

export default function NovaAssistenciaTecnicaModal({ onClose, onCreated }) {
  const [vendas, setVendas] = useState([]);
  const [vendaId, setVendaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listVendasPlanejados('');
        setVendas(data.filter((v) => v.status === 'confirmada'));
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
      const criada = await api.criarAssistenciaTecnicaPlanejada({
        venda_planejado_id: Number(vendaId),
        descricao_assistencia: descricao.trim(),
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
            <p className="picker-subtitle">
              Vincule a uma venda anterior e descreva a pendência de assistência
            </p>
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
            ) : filtradas.length === 0 ? (
              <div className="empty-state">Nenhuma venda confirmada encontrada.</div>
            ) : (
              <div className="picker-table-wrap">
                <table className="picker-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Número</th>
                      <th>Pedido</th>
                      <th>Cliente</th>
                      <th>Total</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((v) => (
                      <tr
                        key={v.id}
                        className={String(v.id) === String(vendaId) ? 'picker-row-selected' : ''}
                        onClick={() => setVendaId(String(v.id))}
                      >
                        <td>
                          <input
                            type="radio"
                            name="venda_assistencia"
                            checked={String(v.id) === String(vendaId)}
                            onChange={() => setVendaId(String(v.id))}
                          />
                        </td>
                        <td><strong>{v.numero}</strong></td>
                        <td>{v.numero_pedido || '—'}</td>
                        <td>{v.cliente_nome}</td>
                        <td>{formatCurrency(v.total)}</td>
                        <td>{formatDate(v.criado_em)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-group" style={{ marginTop: '1.25rem' }}>
              <label>Descrição da assistência *</label>
              <textarea
                rows={3}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Ajuste de porta do roupeiro, troca de puxador..."
                required
              />
            </div>

            {vendaSelecionada && (
              <p className="hint-text">
                Venda selecionada: <strong>{vendaSelecionada.numero}</strong> — {vendaSelecionada.cliente_nome}
              </p>
            )}
          </div>

          <div className="modal-footer picker-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !vendaId || !descricao.trim()}
            >
              {saving ? 'Criando...' : 'Criar assistência'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
