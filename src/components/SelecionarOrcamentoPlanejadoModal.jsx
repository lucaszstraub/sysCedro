import { InlineAlert } from './PageAlert';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { STATUS_LABEL } from '../constants/orcamentoPlanejado';
import { formatCurrency, formatDate } from '../utils/format';

export default function SelecionarOrcamentoPlanejadoModal({ onClose, onSelect, orcamentoAtualId, apenasAprovados = true }) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listOrcamentosPlanejados('');
        setOrcamentos(apenasAprovados ? data.filter((o) => o.status === 'aprovado') : data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [apenasAprovados]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return orcamentos;
    return orcamentos.filter((o) => {
      const haystack = [o.numero, o.cliente_nome, o.status].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(termo);
    });
  }, [orcamentos, busca]);

  const handleSelect = async (orcamento) => {
    try {
      const completo = await api.getOrcamentoPlanejado(orcamento.id);
      onSelect(completo);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Importar de orçamento planejado</h3>
            <p className="picker-subtitle">
              {apenasAprovados
                ? 'Somente orçamentos aprovados podem iniciar uma venda planejada'
                : 'Selecione um orçamento para preencher os dados da venda'}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body picker-body">
          {error && <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>}

          <div className="picker-filters">
            <div className="picker-search-wrap">
              <input
                className="search-input picker-search"
                placeholder="Pesquisar por número, cliente..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="picker-meta">
            <span>{filtrados.length} orçamento(s) encontrado(s)</span>
          </div>

          {loading ? (
            <div className="loading">Carregando orçamentos...</div>
          ) : filtrados.length === 0 ? (
            <div className="empty-state">
              {apenasAprovados
                ? 'Nenhum orçamento aprovado disponível para importação.'
                : 'Nenhum orçamento encontrado.'}
            </div>
          ) : (
            <div className="picker-table-wrap">
              <table className="picker-table">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Criado em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((o) => (
                    <tr key={o.id} className={String(o.id) === String(orcamentoAtualId) ? 'picker-row-selected' : ''}>
                      <td><strong>{o.numero}</strong></td>
                      <td>{o.cliente_nome}</td>
                      <td>{STATUS_LABEL[o.status] || o.status}</td>
                      <td>{formatCurrency(o.total)}</td>
                      <td>{formatDate(o.criado_em)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleSelect(o)}
                        >
                          Importar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer picker-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
